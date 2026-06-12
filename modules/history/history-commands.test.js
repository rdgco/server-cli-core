/**
 * Tests for modules/history/history-commands.js — the `history` module.
 *
 * Exercises the command handlers via the module's dispatcher. The history
 * library's file persistence is stubbed so no real dotfile is touched.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';

import { handle } from './history-commands.js';
import { addCommand, clearHistory } from '../../lib/history.js';

describe('modules/history/history-commands.js', () => {
  let logSpy;

  beforeEach(() => {
    // Stub fs so clearHistory()/persistence never touch the real dotfile.
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    clearHistory();
  });

  afterEach(() => {
    clearHistory();
    jest.restoreAllMocks();
  });

  const output = () => logSpy.mock.calls.flat().join('\n');

  describe('list', () => {
    test('reports an empty history', async () => {
      expect(await handle(['list'])).toBe(true);
      expect(output()).toContain('No command history');
    });

    test('numbers and prints each command', async () => {
      addCommand('first');
      addCommand('second');
      expect(await handle(['list'])).toBe(true);
      const text = output();
      expect(text).toContain('first');
      expect(text).toContain('second');
      expect(text).toContain('Total: 2 command(s)');
    });

    test('is the default command when none is given', async () => {
      addCommand('only');
      expect(await handle([])).toBe(true);
      expect(output()).toContain('only');
    });
  });

  describe('clear', () => {
    test('clears history and confirms', async () => {
      addCommand('gone');
      expect(await handle(['clear'])).toBe(true);
      expect(output()).toContain('Command history cleared');
      // Re-listing now shows nothing.
      logSpy.mockClear();
      await handle(['list']);
      expect(output()).toContain('No command history');
    });
  });

  describe('stats', () => {
    test('reports counts and the history file path', async () => {
      addCommand('a');
      expect(await handle(['stats'])).toBe(true);
      const text = output();
      expect(text).toContain('Current entries: 1');
      expect(text).toContain('Maximum entries: 1000');
      expect(text).toContain('History file:');
    });
  });
});
