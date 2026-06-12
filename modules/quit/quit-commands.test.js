/**
 * Tests for modules/quit/quit-commands.js — the `quit` module.
 *
 * The confirmation prompt reads via readline-sync, which is stubbed.
 */

import { describe, test, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import readlineSync from 'readline-sync';

import { quit, force, addQuitConfirmText, handle } from './quit-commands.js';

afterAll(() => {
  // confirmQuit() calls process.stdin.resume(), which leaves stdin readable
  // and keeps the Jest worker's event loop alive (the "worker failed to exit
  // gracefully" warning). Pause it so the worker exits.
  process.stdin.pause();
});

describe('modules/quit/quit-commands.js', () => {
  let questionSpy;
  let logSpy;

  beforeEach(() => {
    questionSpy = jest.spyOn(readlineSync, 'question');
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const output = () => logSpy.mock.calls.flat().join('\n');

  describe('quit()', () => {
    test('returns "exit" when confirmed with y', async () => {
      questionSpy.mockReturnValue('y');
      await expect(quit()).resolves.toBe('exit');
    });

    test('accepts "yes" (any case) as confirmation', async () => {
      questionSpy.mockReturnValue('YES');
      await expect(quit()).resolves.toBe('exit');
    });

    test('returns null and stays when not confirmed', async () => {
      questionSpy.mockReturnValue('n');
      await expect(quit()).resolves.toBeNull();
      expect(output()).toContain('welcome back');
    });

    test('surfaces hints from registered confirm-text providers', async () => {
      questionSpy.mockReturnValue('n');
      addQuitConfirmText(() => 'You have 3 unsaved cues');
      await quit();
      expect(output()).toContain('You have 3 unsaved cues');
    });

    test('ignores providers that throw or return falsy', async () => {
      questionSpy.mockReturnValue('n');
      addQuitConfirmText(() => { throw new Error('provider boom'); });
      addQuitConfirmText(() => null);
      // Must not throw despite the misbehaving provider.
      await expect(quit()).resolves.toBeNull();
    });
  });

  describe('addQuitConfirmText()', () => {
    test('ignores a non-function argument', () => {
      expect(() => addQuitConfirmText('not a function')).not.toThrow();
    });
  });

  describe('force()', () => {
    test('always returns "exit" without prompting', async () => {
      await expect(force()).resolves.toBe('exit');
      expect(questionSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispatcher handle()', () => {
    test('routes the "force" command', async () => {
      await expect(handle(['force'])).resolves.toBe('exit');
    });

    test('defaults to quit when no command is given', async () => {
      questionSpy.mockReturnValue('y');
      await expect(handle([])).resolves.toBe('exit');
    });
  });
});
