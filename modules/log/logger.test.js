/**
 * Tests for modules/log/logger.js — file logging with module/level filtering.
 *
 * The write stream and file reads are stubbed so assertions are deterministic
 * (a real createWriteStream buffers, making synchronous read-back flaky) and
 * so the suite never touches the real <cwd>/logs/server.log.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';

import {
  initLogger,
  enableLogging,
  disableLogging,
  isLoggingEnabled,
  enableTiming,
  disableTiming,
  isTimingEnabled,
  enableModule,
  enableModules,
  disableModule,
  disableModules,
  clearModuleFilters,
  getModuleFilterStatus,
  getLogPath,
  getLogStats,
  log,
  logDebug,
  logInfo,
  logWarn,
  logErrorMessage,
  logTiming,
  logCategory,
  logObject,
  tailLog,
  headLog,
  clearLog,
  getLoggerState,
  setLoggerState,
  cleanupLogger
} from './logger.js';

describe('modules/log/logger.js', () => {
  let fakeStream;

  beforeEach(() => {
    clearModuleFilters();
    disableTiming();
    // Import-time initLogger() left a real stream open; close it before stubbing.
    if (isLoggingEnabled()) disableLogging();
    fakeStream = { write: jest.fn(), end: jest.fn() };
    jest.spyOn(fs, 'createWriteStream').mockReturnValue(fakeStream);
  });

  afterEach(() => {
    if (isLoggingEnabled()) disableLogging();
    clearModuleFilters();
    disableTiming();
    jest.restoreAllMocks();
  });

  // Everything written to the (stubbed) stream across this test.
  const written = () => fakeStream.write.mock.calls.flat().join('');

  describe('initLogger()', () => {
    test('creates the log dir, rolls, and enables logging', () => {
      // Stub the rollover file checks so no real log file is renamed/removed.
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      initLogger();
      expect(isLoggingEnabled()).toBe(true);
      expect(fs.createWriteStream).toHaveBeenCalled();
    });
  });

  describe('logging enable/disable', () => {
    test('enableLogging turns logging on; disableLogging turns it off', () => {
      expect(enableLogging()).toBe(true);
      expect(isLoggingEnabled()).toBe(true);
      expect(disableLogging()).toBe(true);
      expect(isLoggingEnabled()).toBe(false);
    });

    test('enableLogging is idempotent', () => {
      enableLogging();
      expect(enableLogging()).toBe(true);
      expect(isLoggingEnabled()).toBe(true);
    });

    test('disableLogging is idempotent when already off', () => {
      expect(disableLogging()).toBe(true);
    });

    test('getLogPath ends with logs/server.log', () => {
      expect(getLogPath()).toMatch(/logs[/\\]server\.log$/);
    });
  });

  describe('timing flag', () => {
    test('enable/disable toggles isTimingEnabled', () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      enableTiming();
      expect(isTimingEnabled()).toBe(true);
      disableTiming();
      expect(isTimingEnabled()).toBe(false);
    });

    test('logTiming writes to console only when timing is enabled', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      logTiming('latency 5ms');
      expect(logSpy).not.toHaveBeenCalled();

      enableTiming();
      logSpy.mockClear();
      logTiming('latency 5ms');
      expect(logSpy.mock.calls.flat().join(' ')).toContain('[TIMING]');
    });

    test('logTiming also writes to the log file when logging is enabled', () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      enableLogging();
      enableTiming();
      const marker = 'timing-to-file';
      logTiming(marker);
      expect(written()).toContain(marker);
    });
  });

  describe('module filtering — getModuleFilterStatus()', () => {
    test('defaults to "all" mode with no filters', () => {
      expect(getModuleFilterStatus().mode).toBe('all');
    });

    test('disableModule alone produces blacklist mode', () => {
      disableModule('midi');
      const status = getModuleFilterStatus();
      expect(status.mode).toBe('blacklist');
      expect(status.disabled).toContain('midi');
    });

    test('enableModule with createWhitelist produces whitelist mode', () => {
      enableModule('midi', null, true);
      const status = getModuleFilterStatus();
      expect(status.mode).toBe('whitelist');
      expect(status.enabled).toContain('midi');
    });

    test('a level filter is shown as "module:level+" when enabled', () => {
      enableModule('midi', 'warn', true);
      expect(getModuleFilterStatus().enabled).toContain('midi:warn+');
    });

    test('a per-level disable is shown as "module:levels"', () => {
      disableModule('midi', 'debug');
      expect(getModuleFilterStatus().disabled).toContain('midi:debug');
    });

    test('ignores blank module names', () => {
      enableModule('   ');
      disableModule('');
      expect(getModuleFilterStatus().mode).toBe('all');
    });

    test('rejects invalid levels', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      enableModule('midi', 'verbose', true);
      disableModule('midi', 'trace');
      expect(errSpy).toHaveBeenCalledTimes(2);
      expect(getModuleFilterStatus().mode).toBe('all');
    });

    test('enableModules / disableModules apply to several modules', () => {
      enableModules(['a', 'b'], null, true);
      const status = getModuleFilterStatus();
      expect(status.enabled).toEqual(expect.arrayContaining(['a', 'b']));

      clearModuleFilters();
      disableModules(['c', 'd']);
      expect(getModuleFilterStatus().disabled).toEqual(expect.arrayContaining(['c', 'd']));
    });

    test('enabling a module clears its full blacklist entry', () => {
      disableModule('midi');
      enableModule('midi');
      // Removed from blacklist; with no whitelist this falls back to "all".
      expect(getModuleFilterStatus().mode).toBe('all');
    });

    test('enabling at a level lifts that level and above from the blacklist', () => {
      disableModule('midi', 'warn');
      disableModule('midi', 'error');
      disableModule('midi', 'debug');
      enableModule('midi', 'warn');
      const disabled = getModuleFilterStatus().disabled;
      // warn and error lifted; debug remains.
      const midiEntry = disabled.find(d => d.startsWith('midi:'));
      expect(midiEntry).toBe('midi:debug');
    });
  });

  describe('write path with filtering — log()', () => {
    test('does not write when logging is disabled', () => {
      log('should-not-appear-disabled');
      expect(fs.createWriteStream).not.toHaveBeenCalled();
    });

    test('writes a message when logging is enabled with no filters', () => {
      enableLogging();
      log('marker-all');
      expect(written()).toContain('marker-all');
    });

    test('suppresses a fully-disabled module', () => {
      enableLogging();
      disableModule('mute');
      log('marker-muted', 'mute', 'info');
      expect(written()).not.toContain('marker-muted');
    });

    test('suppresses only the disabled level of a module', () => {
      enableLogging();
      disableModule('partial', 'debug');
      log('marker-debug', 'partial', 'debug');
      log('marker-info', 'partial', 'info');
      expect(written()).not.toContain('marker-debug');
      expect(written()).toContain('marker-info');
    });

    test('whitelist mode suppresses non-whitelisted modules', () => {
      enableLogging();
      enableModule('keep', null, true);
      log('marker-keep', 'keep', 'info');
      log('marker-drop', 'other', 'info');
      expect(written()).toContain('marker-keep');
      expect(written()).not.toContain('marker-drop');
    });

    test('whitelist minimum level suppresses lower levels', () => {
      enableLogging();
      enableModule('lvl', 'warn', true);
      log('marker-low', 'lvl', 'info');
      log('marker-high', 'lvl', 'error');
      expect(written()).not.toContain('marker-low');
      expect(written()).toContain('marker-high');
    });
  });

  describe('level helpers extract the [Module] tag', () => {
    test('logInfo routes by bracket tag through the whitelist', () => {
      enableLogging();
      enableModule('tagged', null, true);
      logInfo('[tagged] tagged-marker');
      expect(written()).toContain('tagged-marker');

      // No bracket → module "main", which is not whitelisted → dropped.
      logWarn('untagged-marker');
      expect(written()).not.toContain('untagged-marker');
    });

    test('logCategory and logObject write structured entries', () => {
      enableLogging();
      logCategory('Route', 'cat-marker', 'info');
      expect(written()).toContain('cat-marker');

      logObject('[obj] payload', { n: 1 }, 'info');
      expect(written()).toContain('"n": 1');
    });

    test('logObject reports a serialization failure for circular input', () => {
      enableLogging();
      const circular = {};
      circular.self = circular;
      logObject('[obj] bad', circular, 'info');
      expect(written()).toContain('Error serializing object');
    });

    test('logDebug emits a [DEBUG] prefix', () => {
      enableLogging();
      logDebug('dbg-marker');
      expect(written()).toContain('[DEBUG]');
      expect(written()).toContain('dbg-marker');
    });

    test('logErrorMessage emits an [ERROR] prefix', () => {
      enableLogging();
      logErrorMessage('err-marker');
      expect(written()).toContain('[ERROR]');
    });
  });

  describe('getLogStats() / tail / head / clear', () => {
    test('reports exists/size/lines for an existing log', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 42 });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('a\nb\nc\n');

      const stats = getLogStats();
      expect(stats.exists).toBe(true);
      expect(stats.size).toBe(42);
      expect(stats.lines).toBe(3);
    });

    test('reports not-exists when there is no file', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const stats = getLogStats();
      expect(stats.exists).toBe(false);
      expect(stats.lines).toBe(0);
    });

    test('reports an error when statSync throws', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('io'); });
      const stats = getLogStats();
      expect(stats.exists).toBe(false);
      expect(stats.error).toBe('io');
    });

    test('tailLog returns the last N non-empty lines', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('l1\nl2\nl3\n\n');
      expect(tailLog(2)).toEqual(['l2', 'l3']);
    });

    test('headLog returns the first N non-empty lines', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('l1\nl2\nl3\n');
      expect(headLog(2)).toEqual(['l1', 'l2']);
    });

    test('tail/head return [] when the file is missing', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(tailLog(5)).toEqual([]);
      expect(headLog(5)).toEqual([]);
    });

    test('tailLog logs and returns [] when reading throws', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('io'); });
      expect(tailLog(5)).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
    });

    test('clearLog removes the file and restarts logging when enabled', () => {
      enableLogging();
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      expect(clearLog()).toBe(true);
      expect(unlink).toHaveBeenCalled();
      // Still logging — a fresh stream is created with a restart header.
      expect(isLoggingEnabled()).toBe(true);
    });

    test('clearLog is a no-op-safe when the file does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      expect(clearLog()).toBe(true);
      expect(unlink).not.toHaveBeenCalled();
    });
  });

  describe('state serialization', () => {
    test('getLoggerState reflects the current filters', () => {
      enableModule('alpha', 'warn', true);
      disableModule('beta', 'debug');
      const state = getLoggerState();
      expect(state.enabledModules.alpha).toBe('warn');
      expect(state.disabledModules.beta).toEqual(['debug']);
    });

    test('getLoggerState marks a fully-disabled module with null', () => {
      disableModule('gamma');
      expect(getLoggerState().disabledModules.gamma).toBeNull();
    });

    test('setLoggerState restores filters from a snapshot', () => {
      setLoggerState({
        enabled: false,
        enabledModules: { gamma: null },
        disabledModules: { delta: null, epsilon: ['error'] }
      });
      const status = getModuleFilterStatus();
      expect(status.enabled).toContain('gamma');
      expect(status.disabled).toContain('delta');
      expect(status.disabled).toContain('epsilon:error');
    });

    test('setLoggerState ignores a null snapshot', () => {
      enableModule('zeta', null, true);
      setLoggerState(null);
      expect(getModuleFilterStatus().enabled).toContain('zeta');
    });

    test('setLoggerState can enable logging via the snapshot', () => {
      expect(isLoggingEnabled()).toBe(false);
      setLoggerState({ enabled: true, enabledModules: {}, disabledModules: {} });
      expect(isLoggingEnabled()).toBe(true);
    });

    test('setLoggerState can disable logging via the snapshot', () => {
      enableLogging();
      setLoggerState({ enabled: false, enabledModules: {}, disabledModules: {} });
      expect(isLoggingEnabled()).toBe(false);
    });
  });

  describe('cleanupLogger()', () => {
    test('is safe to call and closes the stream', () => {
      enableLogging();
      expect(() => cleanupLogger()).not.toThrow();
      expect(fakeStream.end).toHaveBeenCalled();
    });

    test('is safe to call with no active stream', () => {
      expect(() => cleanupLogger()).not.toThrow();
    });
  });
});
