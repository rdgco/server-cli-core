/**
 * Tests for lib/errors.js — centralized error-handling utilities.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

import {
  logError,
  withErrorHandling,
  safeJsonParse,
  safeFileRead,
  safeFileWrite
} from './errors.js';

describe('lib/errors.js', () => {
  let errSpy;
  const originalDebug = process.env.DEBUG;

  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.DEBUG;
  });

  afterEach(() => {
    errSpy.mockRestore();
    if (originalDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = originalDebug;
  });

  describe('logError()', () => {
    test('logs the context and message', () => {
      logError('MyContext', new Error('kaboom'));
      expect(errSpy.mock.calls.flat().join(' ')).toContain('[MyContext]');
      expect(errSpy.mock.calls.flat().join(' ')).toContain('kaboom');
    });

    test('logs details when provided', () => {
      logError('Ctx', new Error('x'), { foo: 'bar' });
      const flat = errSpy.mock.calls.flat();
      expect(flat).toContain('Details:');
    });

    test('omits details when empty', () => {
      logError('Ctx', new Error('x'), {});
      const flat = errSpy.mock.calls.flat();
      expect(flat).not.toContain('Details:');
    });

    test('logs the stack when DEBUG is set', () => {
      process.env.DEBUG = '1';
      logError('Ctx', new Error('x'));
      const flat = errSpy.mock.calls.flat();
      expect(flat).toContain('Stack:');
    });
  });

  describe('withErrorHandling()', () => {
    test('passes through the wrapped function result', async () => {
      const wrapped = withErrorHandling(async (a, b) => a + b, 'Add');
      await expect(wrapped(2, 3)).resolves.toBe(5);
    });

    test('logs and rethrows on failure', async () => {
      const wrapped = withErrorHandling(async () => { throw new Error('nope'); }, 'Fail');
      await expect(wrapped()).rejects.toThrow('nope');
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('safeJsonParse()', () => {
    test('parses valid JSON', () => {
      expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    });

    test('returns the fallback on invalid JSON', () => {
      expect(safeJsonParse('not json', { default: true })).toEqual({ default: true });
      expect(errSpy).toHaveBeenCalled();
    });

    test('defaults the fallback to null', () => {
      expect(safeJsonParse('{bad')).toBeNull();
    });
  });

  describe('safeFileRead()', () => {
    test('reads an existing file', () => {
      const fakeFs = {
        existsSync: () => true,
        readFileSync: (p, enc) => `contents:${enc}`
      };
      expect(safeFileRead(fakeFs, '/x', 'utf8')).toBe('contents:utf8');
    });

    test('throws and logs when the file is missing', () => {
      const fakeFs = { existsSync: () => false, readFileSync: () => 'x' };
      expect(() => safeFileRead(fakeFs, '/missing')).toThrow('File not found');
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('safeFileWrite()', () => {
    test('writes and returns true', () => {
      const writeFileSync = jest.fn();
      expect(safeFileWrite({ writeFileSync }, '/x', 'data')).toBe(true);
      expect(writeFileSync).toHaveBeenCalledWith('/x', 'data');
    });

    test('throws and logs on write failure', () => {
      const fakeFs = { writeFileSync: () => { throw new Error('readonly'); } };
      expect(() => safeFileWrite(fakeFs, '/x', 'data')).toThrow('readonly');
      expect(errSpy).toHaveBeenCalled();
    });
  });
});
