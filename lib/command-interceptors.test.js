import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  registerPreDispatch,
  registerUnknownCommand,
  runPreDispatch,
  runUnknownCommand,
  getRegistered,
  _clearAll
} from './command-interceptors.js';

describe('command-interceptors', () => {
  beforeEach(() => {
    _clearAll();
  });

  describe('registerPreDispatch', () => {
    test('throws when fn is not a function', () => {
      expect(() => registerPreDispatch('bad', 'not-a-fn')).toThrow(TypeError);
      expect(() => registerPreDispatch('bad', null)).toThrow(TypeError);
    });

    test('records the registration in getRegistered()', () => {
      registerPreDispatch('a', () => null);
      registerPreDispatch('b', () => null);
      expect(getRegistered().preDispatch).toEqual(['a', 'b']);
    });
  });

  describe('runPreDispatch', () => {
    test('returns null when no interceptors are registered', async () => {
      expect(await runPreDispatch('anything')).toBeNull();
    });

    test('returns null when every interceptor passes', async () => {
      registerPreDispatch('a', () => null);
      registerPreDispatch('b', async () => null);
      expect(await runPreDispatch('hello')).toBeNull();
    });

    test('first interceptor returning { handled: true } wins', async () => {
      let bCalled = false;
      registerPreDispatch('a', () => ({ handled: true }));
      registerPreDispatch('b', () => { bCalled = true; return null; });
      const result = await runPreDispatch('input');
      expect(result).toEqual({ handled: true });
      expect(bCalled).toBe(false);
    });

    test('first interceptor returning { rewrite: ... } wins', async () => {
      registerPreDispatch('a', input => ({ rewrite: `rewritten-${input}` }));
      registerPreDispatch('b', () => ({ handled: true }));
      const result = await runPreDispatch('foo');
      expect(result).toEqual({ rewrite: 'rewritten-foo' });
    });

    test('skips interceptors that return null and continues', async () => {
      const calls = [];
      registerPreDispatch('a', () => { calls.push('a'); return null; });
      registerPreDispatch('b', () => { calls.push('b'); return null; });
      registerPreDispatch('c', () => { calls.push('c'); return { handled: true }; });
      registerPreDispatch('d', () => { calls.push('d'); return null; });
      await runPreDispatch('input');
      expect(calls).toEqual(['a', 'b', 'c']); // d not reached
    });

    test('awaits async interceptors', async () => {
      registerPreDispatch('async-rewrite', async input => {
        await new Promise(r => setTimeout(r, 5));
        return { rewrite: input.toUpperCase() };
      });
      const result = await runPreDispatch('hello');
      expect(result).toEqual({ rewrite: 'HELLO' });
    });
  });

  describe('runUnknownCommand', () => {
    test('returns null when no interceptors are registered', async () => {
      expect(await runUnknownCommand(['unknown'])).toBeNull();
    });

    test('returns null when every interceptor passes', async () => {
      registerUnknownCommand('a', () => null);
      registerUnknownCommand('b', async () => null);
      expect(await runUnknownCommand(['x'])).toBeNull();
    });

    test('first interceptor returning { handled: true } wins', async () => {
      let bCalled = false;
      registerUnknownCommand('a', parts => parts[0] === 'match' ? { handled: true } : null);
      registerUnknownCommand('b', () => { bCalled = true; return { handled: true }; });
      expect(await runUnknownCommand(['match'])).toEqual({ handled: true });
      expect(bCalled).toBe(false);
    });

    test('parts are passed through to the interceptor', async () => {
      let received;
      registerUnknownCommand('capture', parts => { received = parts; return { handled: true }; });
      await runUnknownCommand(['foo', 'bar', 'baz']);
      expect(received).toEqual(['foo', 'bar', 'baz']);
    });
  });

  describe('registerUnknownCommand', () => {
    test('throws when fn is not a function', () => {
      expect(() => registerUnknownCommand('bad', 42)).toThrow(TypeError);
    });

    test('records the registration in getRegistered()', () => {
      registerUnknownCommand('x', () => null);
      registerUnknownCommand('y', () => null);
      expect(getRegistered().unknownCommand).toEqual(['x', 'y']);
    });
  });
});
