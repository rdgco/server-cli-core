import { jest } from '@jest/globals';
import {
  onShutdown,
  runShutdown,
  hasShutdownRun,
  isShuttingDown,
  _resetForTests
} from './shutdown-service.js';

describe('shutdown-service', () => {
  beforeEach(() => {
    _resetForTests();
  });

  test('runs handlers in LIFO order', async () => {
    const order = [];
    onShutdown('a', () => order.push('a'));
    onShutdown('b', () => order.push('b'));
    onShutdown('c', () => order.push('c'));

    await runShutdown('test');

    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('awaits async handlers', async () => {
    const order = [];
    onShutdown('slow', async () => {
      await new Promise(r => setTimeout(r, 20));
      order.push('slow');
    });
    onShutdown('fast', () => order.push('fast'));

    await runShutdown('test');

    // LIFO: fast registered last, runs first
    expect(order).toEqual(['fast', 'slow']);
  });

  test('one handler throwing does not stop the others', async () => {
    const log = [];
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    onShutdown('first', () => log.push('first'));
    onShutdown('boom', () => { throw new Error('intentional'); });
    onShutdown('last', () => log.push('last'));

    await runShutdown('test');

    expect(log).toEqual(['last', 'first']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('boom: intentional'));

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('handler exceeding timeout is reported and shutdown continues', async () => {
    const log = [];
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    onShutdown('first', () => log.push('first'));
    onShutdown('hang', () => new Promise(() => { /* never resolves */ }));

    await runShutdown('test', { handlerTimeoutMs: 30 });

    expect(log).toEqual(['first']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('hang: timeout after 30ms'));

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('runShutdown is idempotent', async () => {
    const calls = jest.fn();
    onShutdown('once', calls);

    await runShutdown('test');
    await runShutdown('test-again');

    expect(calls).toHaveBeenCalledTimes(1);
    expect(hasShutdownRun()).toBe(true);
  });

  test('isShuttingDown is true while handlers run, false after', async () => {
    let observedDuring = null;
    onShutdown('observe', () => { observedDuring = isShuttingDown(); });

    expect(isShuttingDown()).toBe(false);
    await runShutdown('test');
    expect(observedDuring).toBe(true);
    expect(isShuttingDown()).toBe(false);
  });

  test('onShutdown rejects non-function values', () => {
    expect(() => onShutdown('bad', 'not a fn')).toThrow(/must be a function/);
  });
});
