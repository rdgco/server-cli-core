/**
 * Smoke test for the two-module demo.
 *
 * Boots the example via `bootstrap({ autoStartRepl: false })` and
 * drives the dispatch chain through `executeCommand`. This is the
 * package's "does a non-trivial consumer actually boot and dispatch
 * correctly" check — runs on every commit.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import { bootstrap } from '../../index.js';
import * as moduleRegistry from '../../lib/module-registry.js';
import * as commandInterceptors from '../../lib/command-interceptors.js';
import * as shutdownService from '../../lib/shutdown-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(__dirname, 'modules');

let logSpy;
let errSpy;

beforeEach(() => {
  moduleRegistry.clearModules();
  commandInterceptors._clearAll();
  shutdownService._resetForTests();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
});

function output() {
  return logSpy.mock.calls.flat().join('\n');
}

describe('two-module-demo', () => {
  test('boots and registers both consumer modules + the bundled shell modules', async () => {
    await bootstrap({ modulesDir, autoStartRepl: false });
    const loaded = Object.keys(moduleRegistry.getModules());
    // Consumer modules
    expect(loaded).toContain('greet');
    expect(loaded).toContain('count');
    // Bundled shell modules (auto-discovered from the package)
    expect(loaded).toContain('help');
    expect(loaded).toContain('log');
    expect(loaded).toContain('history');
    expect(loaded).toContain('quit');
  });

  test('greet <name> prints a greeting', async () => {
    const handle = await bootstrap({ modulesDir, autoStartRepl: false });
    await handle.executeCommand('greet world');
    expect(output()).toContain('hello, world');
  });

  test('greet without a name reports usage', async () => {
    const handle = await bootstrap({ modulesDir, autoStartRepl: false });
    await handle.executeCommand('greet');
    expect(errSpy.mock.calls.flat().join('\n')).toContain('Usage: greet <name>');
  });

  test('count increments across invocations and reset returns to 0', async () => {
    const handle = await bootstrap({ modulesDir, autoStartRepl: false });
    // Module-level `let counter` survives Node's module cache across
    // bootstrap() calls in the same test file, so reset to a known
    // baseline before observing.
    await handle.executeCommand('count reset');
    logSpy.mockClear();

    await handle.executeCommand('count');
    await handle.executeCommand('count');
    await handle.executeCommand('count');
    const calls = logSpy.mock.calls.flat();
    expect(calls).toEqual([1, 2, 3]);

    await handle.executeCommand('count reset');
    logSpy.mockClear();
    await handle.executeCommand('count');
    expect(logSpy.mock.calls.flat()).toEqual([1]);
  });

  test('count peek does not increment', async () => {
    const handle = await bootstrap({ modulesDir, autoStartRepl: false });
    await handle.executeCommand('count reset');
    logSpy.mockClear();

    await handle.executeCommand('count'); // counter → 1
    await handle.executeCommand('count peek'); // does not change counter
    await handle.executeCommand('count peek'); // does not change counter
    await handle.executeCommand('count'); // counter → 2

    const calls = logSpy.mock.calls.flat();
    expect(calls).toEqual([1, 'counter is 1', 'counter is 1', 2]);
  });

  test('unknown command falls through to "Unknown command" error', async () => {
    const handle = await bootstrap({ modulesDir, autoStartRepl: false });
    await handle.executeCommand('whatisthis');
    expect(errSpy.mock.calls.flat().join('\n')).toContain('Unknown command');
  });

  test('banner is printed when configured', async () => {
    await bootstrap({
      modulesDir,
      banner: 'demo banner here',
      autoStartRepl: false
    });
    expect(output()).toContain('demo banner here');
  });
});
