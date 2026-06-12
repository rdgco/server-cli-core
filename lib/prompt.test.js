/**
 * Tests for lib/prompt.js — async readline-based prompts.
 */

import { describe, test, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import readlineSync from 'readline-sync';

import { confirmYesNo, confirmWithText, question, choose } from './prompt.js';

afterAll(() => {
  // The prompt helpers call process.stdin.resume(), which leaves stdin
  // readable and keeps the Jest worker's event loop alive (the
  // "worker failed to exit gracefully" warning). Pause it so the worker exits.
  process.stdin.pause();
});

describe('lib/prompt.js', () => {
  let questionSpy;
  let logSpy;

  beforeEach(() => {
    questionSpy = jest.spyOn(readlineSync, 'question');
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('confirmYesNo()', () => {
    test('treats y / yes (any case) as confirmation', async () => {
      questionSpy.mockReturnValue('y');
      await expect(confirmYesNo('ok?')).resolves.toBe(true);
      questionSpy.mockReturnValue('YES');
      await expect(confirmYesNo('ok?')).resolves.toBe(true);
    });

    test('treats anything else as a no', async () => {
      questionSpy.mockReturnValue('nope');
      await expect(confirmYesNo('ok?')).resolves.toBe(false);
    });

    test('returns the default when the answer is empty', async () => {
      questionSpy.mockReturnValue('');
      await expect(confirmYesNo('ok?', true)).resolves.toBe(true);
      await expect(confirmYesNo('ok?', false)).resolves.toBe(false);
    });

    test('shows the [Y/n] suffix when the default is true', async () => {
      questionSpy.mockReturnValue('');
      await confirmYesNo('ok?', true);
      expect(questionSpy.mock.calls[0][0]).toContain('[Y/n]');
    });

    test('shows the [y/N] suffix when the default is false', async () => {
      questionSpy.mockReturnValue('');
      await confirmYesNo('ok?', false);
      expect(questionSpy.mock.calls[0][0]).toContain('[y/N]');
    });
  });

  describe('confirmWithText()', () => {
    test('returns true only on an exact (trimmed) match', async () => {
      questionSpy.mockReturnValue('  CONFIRM ');
      await expect(confirmWithText('msg', 'CONFIRM')).resolves.toBe(true);
    });

    test('returns false on a mismatch', async () => {
      questionSpy.mockReturnValue('wrong');
      await expect(confirmWithText('msg', 'CONFIRM')).resolves.toBe(false);
    });
  });

  describe('question()', () => {
    test('returns the trimmed answer', async () => {
      questionSpy.mockReturnValue('  hello  ');
      await expect(question('name?')).resolves.toBe('hello');
    });

    test('returns the default when the answer is empty', async () => {
      questionSpy.mockReturnValue('');
      await expect(question('name?', 'anon')).resolves.toBe('anon');
    });

    test('shows the default in the prompt when provided', async () => {
      questionSpy.mockReturnValue('x');
      await question('name?', 'anon');
      expect(questionSpy.mock.calls[0][0]).toContain('[anon]');
    });
  });

  describe('choose()', () => {
    const options = ['red', 'green', 'blue'];

    test('returns the zero-based index of the selection', async () => {
      questionSpy.mockReturnValue('2');
      await expect(choose('pick', options)).resolves.toBe(1);
    });

    test('returns the default index when the answer is empty', async () => {
      questionSpy.mockReturnValue('');
      await expect(choose('pick', options, 2)).resolves.toBe(2);
    });

    test('returns the default index for an out-of-range selection', async () => {
      questionSpy.mockReturnValue('99');
      await expect(choose('pick', options, 0)).resolves.toBe(0);
    });

    test('lists options and marks the default', async () => {
      questionSpy.mockReturnValue('1');
      await choose('pick', options, 1);
      const printed = logSpy.mock.calls.flat().join('\n');
      expect(printed).toContain('1. red');
      expect(printed).toContain('2. green (default)');
      expect(printed).toContain('3. blue');
    });
  });

  describe('TTY raw-mode handling', () => {
    let originalIsTTY;
    let originalSetRawMode;
    let setRawMode;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
      originalSetRawMode = process.stdin.setRawMode;
      setRawMode = jest.fn();
      process.stdin.isTTY = true;
      process.stdin.isRaw = true;
      process.stdin.setRawMode = setRawMode;
    });

    afterEach(() => {
      process.stdin.isTTY = originalIsTTY;
      process.stdin.setRawMode = originalSetRawMode;
    });

    test('each prompt disables raw mode and restores the prior state', async () => {
      questionSpy.mockReturnValue('y');
      await confirmYesNo('ok?');
      await confirmWithText('msg', 'nope');
      await question('q?');
      await choose('pick', ['a', 'b']);

      // Disabled to capture visible input on every prompt...
      expect(setRawMode).toHaveBeenCalledWith(false);
      // ...then restored to the captured raw state (true).
      expect(setRawMode).toHaveBeenCalledWith(true);
      // 4 prompts × (disable + restore) = 8 calls.
      expect(setRawMode).toHaveBeenCalledTimes(8);
    });
  });
});
