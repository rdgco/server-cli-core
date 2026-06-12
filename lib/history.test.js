/**
 * Tests for lib/history.js — in-process command history with file persistence.
 *
 * The persistence path is a fixed dotfile in the user's home directory,
 * so every test stubs the `fs` calls. No test is allowed to read, write,
 * or delete the real history file.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';

import {
  loadHistory,
  saveHistory,
  getHistory,
  addCommand,
  clearHistory,
  getStats
} from './history.js';

describe('lib/history.js', () => {
  let existsSpy;
  let readSpy;
  let writeSpy;
  let unlinkSpy;
  let errSpy;

  beforeEach(() => {
    existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Reset the module's in-memory array to a known-empty baseline.
    clearHistory();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('addCommand() / getHistory()', () => {
    test('appends trimmed commands', () => {
      addCommand('  hello  ');
      addCommand('world');
      expect(getHistory()).toEqual(['hello', 'world']);
    });

    test('ignores empty or whitespace-only commands', () => {
      addCommand('');
      addCommand('   ');
      addCommand(null);
      addCommand(undefined);
      expect(getHistory()).toEqual([]);
    });

    test('caps the in-memory history at the maximum size', () => {
      for (let i = 0; i < 1005; i++) addCommand(`cmd${i}`);
      const history = getHistory();
      expect(history.length).toBe(1000);
      // Oldest entries are dropped; newest is retained.
      expect(history[history.length - 1]).toBe('cmd1004');
      expect(history[0]).toBe('cmd5');
    });
  });

  describe('loadHistory()', () => {
    test('returns an empty array when the file does not exist', () => {
      existsSpy.mockReturnValue(false);
      expect(loadHistory()).toEqual([]);
    });

    test('parses non-empty lines from the file', () => {
      existsSpy.mockReturnValue(true);
      readSpy.mockReturnValue('a\nb\n\n  \nc\n');
      expect(loadHistory()).toEqual(['a', 'b', 'c']);
    });

    test('logs and recovers when reading throws', () => {
      existsSpy.mockReturnValue(true);
      readSpy.mockImplementation(() => { throw new Error('boom'); });
      expect(loadHistory()).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('saveHistory()', () => {
    test('writes the internal history when no argument is given', () => {
      addCommand('one');
      addCommand('two');
      saveHistory();
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const [, content] = writeSpy.mock.calls[0];
      expect(content).toBe('one\ntwo\n');
    });

    test('writes a provided history array', () => {
      saveHistory(['x', 'y']);
      const [, content] = writeSpy.mock.calls[0];
      expect(content).toBe('x\ny\n');
    });

    test('logs when writing throws', () => {
      writeSpy.mockImplementation(() => { throw new Error('disk full'); });
      saveHistory(['z']);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('clearHistory()', () => {
    test('empties the in-memory history', () => {
      addCommand('a');
      clearHistory();
      expect(getHistory()).toEqual([]);
    });

    test('deletes the file when it exists', () => {
      existsSpy.mockReturnValue(true);
      clearHistory();
      expect(unlinkSpy).toHaveBeenCalledTimes(1);
    });

    test('does not attempt deletion when the file is absent', () => {
      existsSpy.mockReturnValue(false);
      clearHistory();
      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    test('logs when deletion throws', () => {
      existsSpy.mockReturnValue(true);
      unlinkSpy.mockImplementation(() => { throw new Error('locked'); });
      clearHistory();
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('getStats()', () => {
    test('reports count, max size, and file path', () => {
      addCommand('a');
      addCommand('b');
      const stats = getStats();
      expect(stats.count).toBe(2);
      expect(stats.maxSize).toBe(1000);
      expect(typeof stats.file).toBe('string');
      expect(stats.file).toMatch(/\.mididaddy_history$/);
    });
  });
});
