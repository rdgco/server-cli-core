/**
 * Tests for modules/log/log-commands.js — the `log` module's command handlers.
 *
 * The underlying logger is real, but its file I/O is stubbed (createWriteStream
 * plus the read/stat calls) so the handlers run end-to-end without touching disk.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';

import {
  enable,
  disable,
  status,
  tail,
  head,
  clear,
  path as logPath,
  handle,
  autocomplete
} from './log-commands.js';
import {
  isLoggingEnabled,
  disableLogging,
  clearModuleFilters,
  disableModule,
  disableTiming
} from './logger.js';
import { setModules, clearModules } from '../../lib/module-registry.js';

describe('modules/log/log-commands.js', () => {
  let logSpy;

  beforeEach(() => {
    clearModuleFilters();
    disableTiming();
    if (isLoggingEnabled()) disableLogging();

    jest.spyOn(fs, 'createWriteStream').mockReturnValue({ write: jest.fn(), end: jest.fn() });
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 2048 });
    jest.spyOn(fs, 'readFileSync').mockReturnValue('line one\nline two\nline three\n');
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (isLoggingEnabled()) disableLogging();
    clearModuleFilters();
    clearModules();
    jest.restoreAllMocks();
  });

  const output = () => logSpy.mock.calls.flat().join('\n');

  describe('enable()', () => {
    test('enables all logging with no arguments', async () => {
      expect(await enable([])).toBe(true);
      expect(output()).toContain('Logging enabled (all modules, all levels)');
    });

    test('enables a specific module (whitelist) when starting from "all"', async () => {
      expect(await enable(['midi'])).toBe(true);
      expect(output()).toContain('Logging enabled for midi (all levels)');
    });

    test('enables a specific module at a level', async () => {
      expect(await enable(['midi', 'warn'])).toBe(true);
      expect(output()).toContain('WARN and above');
    });

    test('rejects an invalid level', async () => {
      expect(await enable(['midi', 'loud'])).toBe(false);
      expect(output()).toContain('Invalid log level');
    });

    test('re-enables a module that was blacklisted', async () => {
      disableModule('midi');
      expect(await enable(['midi'])).toBe(true);
      expect(output()).toContain('Re-enabled logging for midi');
    });

    test('adds a module to an existing whitelist', async () => {
      await enable(['first']); // creates the whitelist
      logSpy.mockClear();
      expect(await enable(['second'])).toBe(true);
      expect(output()).toContain('Added second to whitelist');
    });

    test('prints the enabled and disabled lists after a whitelist edit', async () => {
      disableModule('noisy'); // seed a blacklist entry
      await enable(['keep']); // re-enable path prints both lists
      const text = output();
      expect(text).toContain('Disabled: noisy');
    });
  });

  describe('disable()', () => {
    test('disables all logging with no arguments', async () => {
      expect(await disable([])).toBe(true);
      expect(output()).toContain('Logging disabled');
    });

    test('disables a specific module', async () => {
      expect(await disable(['midi'])).toBe(true);
      expect(output()).toContain('Disabled all logging for midi');
    });

    test('disables a specific level for a module', async () => {
      expect(await disable(['midi', 'debug'])).toBe(true);
      expect(output()).toContain('Disabled DEBUG level for midi');
    });

    test('rejects an invalid level', async () => {
      expect(await disable(['midi', 'loud'])).toBe(false);
      expect(output()).toContain('Invalid log level');
    });

    test('prints the enabled list when a whitelist is active', async () => {
      await enable(['midi']); // whitelist mode with midi enabled
      logSpy.mockClear();
      await disable(['other', 'debug']); // adds a per-level blacklist entry
      const text = output();
      expect(text).toContain('Enabled: midi');
      expect(text).toContain('Disabled: other:debug');
    });
  });

  describe('status()', () => {
    test('renders status with file stats in "all" mode', async () => {
      expect(await status()).toBe(true);
      const text = output();
      expect(text).toContain('Logging Status:');
      expect(text).toContain('Mode: All modules (no filter)');
    });

    test('renders whitelist mode', async () => {
      await enable(['midi', 'info']);
      logSpy.mockClear();
      await status();
      expect(output()).toContain('Mode: Whitelist');
    });

    test('renders blacklist mode', async () => {
      disableModule('noisy');
      await status();
      expect(output()).toContain('Mode: Blacklist');
    });

    test('handles a not-yet-created log file', async () => {
      fs.existsSync.mockReturnValue(false);
      await status();
      expect(output()).toContain('Not created yet');
    });
  });

  describe('tail() / head()', () => {
    test('tail prints the requested lines', async () => {
      expect(await tail('2')).toBe(true);
      expect(output()).toContain('line two');
    });

    test('head prints the requested lines', async () => {
      expect(await head('2')).toBe(true);
      expect(output()).toContain('line one');
    });

    test('tail rejects out-of-range counts', async () => {
      // parseInt('0') is falsy and falls back to the default 10, so use a
      // negative value to exercise the lower bound.
      expect(await tail('-5')).toBe(false);
      expect(await tail('1001')).toBe(false);
    });

    test('head rejects out-of-range counts', async () => {
      expect(await head('5000')).toBe(false);
    });

    test('report no entries when the file is empty', async () => {
      fs.readFileSync.mockReturnValue('');
      expect(await tail('10')).toBe(true);
      expect(output()).toContain('No log entries found');
    });
  });

  describe('clear()', () => {
    test('reports when there is nothing to clear', async () => {
      fs.existsSync.mockReturnValue(false);
      expect(await clear()).toBe(true);
      expect(output()).toContain('No log file to clear');
    });

    test('clears an existing log file', async () => {
      expect(await clear()).toBe(true);
      expect(output()).toContain('Log cleared');
    });
  });

  describe('path()', () => {
    test('prints the log file path', async () => {
      expect(await logPath()).toBe(true);
      expect(output()).toMatch(/server\.log/);
    });
  });

  describe('dispatcher subcommands via handle()', () => {
    test('"filter clear" removes module filters', async () => {
      disableModule('x');
      expect(await handle(['filter', 'clear'])).toBe(true);
      expect(output()).toContain('Module filters cleared');
    });

    test('bare "filter" prints usage and returns false', async () => {
      expect(await handle(['filter'])).toBe(false);
      expect(output()).toContain('Usage: log filter clear');
    });

    test('"timing" enables timing logging', async () => {
      expect(await handle(['timing'])).toBe(true);
      expect(output()).toContain('Timing logging enabled');
    });

    test('"timing off" disables timing logging', async () => {
      expect(await handle(['timing', 'off'])).toBe(true);
      expect(output()).toContain('Timing logging disabled');
    });

    test('bare "log" runs the default status command', async () => {
      expect(await handle([])).toBe(true);
      expect(output()).toContain('Logging Status:');
    });
  });

  describe('autocomplete', () => {
    test('completes module names against the registry', () => {
      setModules({ midi: {}, mixer: {}, help: {} });
      const [completions] = autocomplete(['log', 'enable', 'mi'], 'log enable mi');
      expect(completions).toEqual(
        expect.arrayContaining(['log enable midi', 'log enable mixer'])
      );
      expect(completions).not.toContain('log enable help');
    });

    test('completes log levels at the second positional argument', () => {
      const [completions] = autocomplete(['log', 'enable', 'midi', 'wa'], 'log enable midi wa');
      expect(completions).toContain('log enable midi warn');
    });
  });
});
