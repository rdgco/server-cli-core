import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { tryShellBuiltin, applyPluralRewrite, moduleHasListCommand } from './shell-builtins.js';

describe('tryShellBuiltin', () => {
  let consoleClear;
  let consoleLog;
  let consoleError;

  beforeEach(() => {
    consoleClear = jest.spyOn(console, 'clear').mockImplementation(() => {});
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleClear.mockRestore();
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  test('returns null for empty input', async () => {
    expect(await tryShellBuiltin([])).toBeNull();
    expect(await tryShellBuiltin(null)).toBeNull();
  });

  test('handles `clear` and calls console.clear()', async () => {
    const result = await tryShellBuiltin(['clear']);
    expect(result).toEqual({ handled: true });
    expect(consoleClear).toHaveBeenCalledTimes(1);
  });

  test('handles `wait <ms>` and resolves after the delay', async () => {
    const start = Date.now();
    const result = await tryShellBuiltin(['wait', '40']);
    const elapsed = Date.now() - start;
    expect(result).toEqual({ handled: true });
    expect(elapsed).toBeGreaterThanOrEqual(35); // small slack for timer drift
  });

  test('`wait` with NaN argument prints usage and returns handled', async () => {
    const result = await tryShellBuiltin(['wait', 'forever']);
    expect(result).toEqual({ handled: true });
    expect(consoleError).toHaveBeenCalledWith('Usage: wait <milliseconds>');
  });

  test('`wait` with negative number prints usage and returns handled', async () => {
    const result = await tryShellBuiltin(['wait', '-5']);
    expect(result).toEqual({ handled: true });
    expect(consoleError).toHaveBeenCalledWith('Usage: wait <milliseconds>');
  });

  test('returns null for unrecognized commands', async () => {
    expect(await tryShellBuiltin(['route', 'list'])).toBeNull();
    expect(await tryShellBuiltin(['help'])).toBeNull();
  });
});

describe('applyPluralRewrite', () => {
  const modules = {
    route: { commands: { list: { handler: () => {} }, add: {} } },
    car: { commands: { remove: {} } } // no `list`
  };

  test('returns parts unchanged when first word is a known module', () => {
    expect(applyPluralRewrite(['route', 'add', 'foo'], modules)).toEqual(['route', 'add', 'foo']);
  });

  test('rewrites plural to singular + list', () => {
    expect(applyPluralRewrite(['routes'], modules)).toEqual(['route', 'list']);
  });

  test('preserves trailing args during rewrite', () => {
    expect(applyPluralRewrite(['routes', 'someName', 'flag'], modules))
      .toEqual(['route', 'list', 'someName', 'flag']);
  });

  test('does not rewrite when singular module lacks `list`', () => {
    expect(applyPluralRewrite(['cars'], modules)).toEqual(['cars']);
  });

  test('does not rewrite when no matching singular module exists', () => {
    expect(applyPluralRewrite(['apples'], modules)).toEqual(['apples']);
  });

  test('does not rewrite a non-plural word', () => {
    expect(applyPluralRewrite(['route'], modules)).toEqual(['route']);
  });

  test('handles empty parts gracefully', () => {
    expect(applyPluralRewrite([], modules)).toEqual([]);
  });

  test('also recognizes the legacy module.metadata.commands.list shape', () => {
    const legacy = { metadata: { commands: { list: 'List things' } } };
    expect(applyPluralRewrite(['legacys'], { legacy })).toEqual(['legacy', 'list']);
  });
});

describe('moduleHasListCommand', () => {
  test('true for new-shape registry with list', () => {
    expect(moduleHasListCommand({ commands: { list: { handler: () => {} } } })).toBe(true);
  });

  test('true for legacy metadata.commands shape', () => {
    expect(moduleHasListCommand({ metadata: { commands: { list: 'help text' } } })).toBe(true);
  });

  test('false for module with no list command', () => {
    expect(moduleHasListCommand({ commands: { add: {} } })).toBe(false);
  });

  test('false for null/undefined module', () => {
    expect(moduleHasListCommand(null)).toBe(false);
    expect(moduleHasListCommand(undefined)).toBe(false);
  });
});
