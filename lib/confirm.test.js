/**
 * Tests for lib/confirm.js — exact-text confirmation prompt.
 */

import { describe, test, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import readlineSync from 'readline-sync';

import { confirmWithText } from './confirm.js';

afterAll(() => {
  // confirmWithText() calls process.stdin.resume(), which leaves stdin
  // readable and keeps the Jest worker's event loop alive (the
  // "worker failed to exit gracefully" warning). Pause it so the worker exits.
  process.stdin.pause();
});

describe('lib/confirm.js', () => {
  let questionSpy;
  let logSpy;

  beforeEach(() => {
    questionSpy = jest.spyOn(readlineSync, 'question');
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('confirmWithText()', () => {
    test('returns true when the answer matches exactly', () => {
      questionSpy.mockReturnValue('DELETE');
      expect(confirmWithText('Confirm?', 'DELETE')).toBe(true);
    });

    test('trims surrounding whitespace before comparing', () => {
      questionSpy.mockReturnValue('  DELETE  ');
      expect(confirmWithText('Confirm?', 'DELETE')).toBe(true);
    });

    test('returns false and reports cancellation on a mismatch', () => {
      questionSpy.mockReturnValue('nope');
      expect(confirmWithText('Confirm?', 'DELETE')).toBe(false);
      expect(logSpy.mock.calls.flat().join(' ')).toContain('Action cancelled');
    });

    test('prints the supplied message', () => {
      questionSpy.mockReturnValue('x');
      confirmWithText('Really delete everything?', 'YES');
      expect(logSpy.mock.calls.flat().join(' ')).toContain('Really delete everything?');
    });

    test('toggles raw mode when stdin is a TTY', () => {
      const originalIsTTY = process.stdin.isTTY;
      const setRawMode = jest.fn();
      process.stdin.isTTY = true;
      process.stdin.isRaw = true;
      const originalSetRawMode = process.stdin.setRawMode;
      process.stdin.setRawMode = setRawMode;

      try {
        questionSpy.mockReturnValue('OK');
        expect(confirmWithText('msg', 'OK')).toBe(true);
        // Disabled to capture visible input, then restored to the prior raw state.
        expect(setRawMode).toHaveBeenCalledWith(false);
        expect(setRawMode).toHaveBeenCalledWith(true);
      } finally {
        process.stdin.isTTY = originalIsTTY;
        process.stdin.setRawMode = originalSetRawMode;
      }
    });
  });
});
