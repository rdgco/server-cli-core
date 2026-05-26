/**
 * Smoke tests for `bootstrap`.
 *
 * All tests run with `autoStartRepl: false, includePackageModules: false` so jest's stdin isn't
 * hijacked and `process.exit` isn't called. The dispatch chain is
 * driven via the returned `executeCommand` handle.
 *
 * Signal-handler integration (SIGTERM, SIGINT, uncaughtException,
 * unhandledRejection) is not covered here — those need a subprocess
 * fixture and are deferred to a follow-up integration test. The
 * shutdown chain itself is already covered by
 * `lib/shutdown-service.test.js`.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { bootstrap } from './bootstrap.js';
import * as moduleRegistry from './module-registry.js';
import * as commandInterceptors from './command-interceptors.js';
import * as shutdownService from './shutdown-service.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
  // Mark the tmp dir as ESM so dynamic imports of fake modules
  // don't fall back to CJS lexing.
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"type":"module"}');
  moduleRegistry.clearModules();
  commandInterceptors._clearAll();
  shutdownService._resetForTests();
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
});

function fakeModule(dir, name, body) {
  const moduleDir = path.join(dir, name);
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, `${name}-commands.js`), body);
}

describe('bootstrap()', () => {
  test('throws if modulesDir is not provided', async () => {
    await expect(bootstrap({})).rejects.toThrow('modulesDir');
  });

  test('returns a handle with executeCommand + shutdown', async () => {
    const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
    expect(typeof handle.executeCommand).toBe('function');
    expect(typeof handle.shutdown).toBe('function');
  });

  test('discovers and loads modules from modulesDir', async () => {
    fakeModule(tmpDir, 'greet', `
      export const metadata = { name: 'Greet', prefix: 'greet' };
      export const commands = {};
      export function handle() { return true; }
    `);
    fakeModule(tmpDir, 'count', `
      export const metadata = { name: 'Count', prefix: 'count' };
      export const commands = {};
      export function handle() { return true; }
    `);

    await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
    const loaded = Object.keys(moduleRegistry.getModules()).sort();
    expect(loaded).toEqual(['count', 'greet']);
  });

  test('handles an empty modulesDir without erroring', async () => {
    const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
    expect(Object.keys(moduleRegistry.getModules())).toEqual([]);
    expect(typeof handle.executeCommand).toBe('function');
  });

  test('handles a non-existent modulesDir without erroring', async () => {
    const ghost = path.join(tmpDir, 'does-not-exist');
    await bootstrap({ modulesDir: ghost, autoStartRepl: false, includePackageModules: false });
    expect(Object.keys(moduleRegistry.getModules())).toEqual([]);
  });

  test('with includePackageModules=true (default), auto-discovers help/log/history/quit', async () => {
    fakeModule(tmpDir, 'app', `
      export const metadata = { prefix: 'app' };
      export const commands = {};
    `);
    await bootstrap({ modulesDir: tmpDir, autoStartRepl: false });
    const loaded = Object.keys(moduleRegistry.getModules());
    expect(loaded).toContain('app');
    expect(loaded).toContain('help');
    expect(loaded).toContain('log');
    expect(loaded).toContain('history');
    expect(loaded).toContain('quit');
  });

  test('a same-named module in the consumer modulesDir overrides the bundled one', async () => {
    fakeModule(tmpDir, 'help', `
      export const metadata = { prefix: 'help' };
      export const consumerOverride = true;
    `);
    await bootstrap({ modulesDir: tmpDir, autoStartRepl: false });
    expect(moduleRegistry.getModules().help.consumerOverride).toBe(true);
  });

  test('skips subdirs that lack a <name>-commands.js entry', async () => {
    fs.mkdirSync(path.join(tmpDir, 'noentry'));
    fakeModule(tmpDir, 'real', `
      export const metadata = { name: 'Real', prefix: 'real' };
      export const commands = {};
    `);
    await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
    expect(Object.keys(moduleRegistry.getModules())).toEqual(['real']);
  });

  describe('loadOrder', () => {
    test('listed modules load in order, then the rest alphabetical', async () => {
      const loadLog = [];
      // Three modules: zebra, apple, middle. Default alphabetical would be
      // apple → middle → zebra. With loadOrder=['zebra','apple'] we expect:
      // zebra → apple → middle.
      for (const name of ['zebra', 'apple', 'middle']) {
        fakeModule(tmpDir, name, `
          export const metadata = { name: '${name}', prefix: '${name}' };
          export const commands = {};
        `);
      }
      await bootstrap({
        modulesDir: tmpDir,
        loadOrder: ['zebra', 'apple'],
        onModuleLoaded: name => { loadLog.push(name); },
        autoStartRepl: false, includePackageModules: false
      });
      expect(loadLog).toEqual(['zebra', 'apple', 'middle']);
    });

    test('loadOrder entries that do not exist on disk are silently skipped', async () => {
      fakeModule(tmpDir, 'real', `export const metadata = { prefix: 'real' };`);
      const loadLog = [];
      await bootstrap({
        modulesDir: tmpDir,
        loadOrder: ['ghost', 'real', 'phantom'],
        onModuleLoaded: name => { loadLog.push(name); },
        autoStartRepl: false, includePackageModules: false
      });
      expect(loadLog).toEqual(['real']);
    });
  });

  describe('module init', () => {
    test('calls init() on each module that defines one', async () => {
      fakeModule(tmpDir, 'inits', `
        let initialized = false;
        export const metadata = { prefix: 'inits' };
        export async function init() { initialized = true; }
        export function wasInitialized() { return initialized; }
      `);
      await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      const mod = moduleRegistry.getModules().inits;
      expect(mod.wasInitialized()).toBe(true);
    });

    test('throws if a module init() throws and continueOnInitFailure is unset', async () => {
      fakeModule(tmpDir, 'broken', `
        export const metadata = { prefix: 'broken' };
        export async function init() { throw new Error('init boom'); }
      `);
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false })
      ).rejects.toThrow('init boom');
      errSpy.mockRestore();
    });

    test('continues if a module sets metadata.continueOnInitFailure=true', async () => {
      fakeModule(tmpDir, 'flaky', `
        export const metadata = { prefix: 'flaky', continueOnInitFailure: true };
        export async function init() { throw new Error('flaky boom'); }
      `);
      // Should NOT reject. The warning goes through logErrorMessage which
      // writes to the log module — fine; we just care it doesn't blow up.
      await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      expect(Object.keys(moduleRegistry.getModules())).toContain('flaky');
    });
  });

  describe('hooks', () => {
    test('onModuleLoaded fires after each module load with (name, module)', async () => {
      fakeModule(tmpDir, 'one', `export const metadata = { prefix: 'one' };`);
      fakeModule(tmpDir, 'two', `export const metadata = { prefix: 'two' };`);
      const calls = [];
      await bootstrap({
        modulesDir: tmpDir,
        onModuleLoaded: (name, module) => {
          calls.push({ name, hasMetadata: !!module.metadata });
        },
        autoStartRepl: false, includePackageModules: false
      });
      expect(calls.length).toBe(2);
      expect(calls.every(c => c.hasMetadata)).toBe(true);
      expect(calls.map(c => c.name).sort()).toEqual(['one', 'two']);
    });

    test('onModuleLoaded sees the registry growing incrementally', async () => {
      fakeModule(tmpDir, 'first', `export const metadata = { prefix: 'first' };`);
      fakeModule(tmpDir, 'second', `export const metadata = { prefix: 'second' };`);
      const snapshots = [];
      await bootstrap({
        modulesDir: tmpDir,
        loadOrder: ['first', 'second'],
        onModuleLoaded: () => {
          snapshots.push(Object.keys(moduleRegistry.getModules()).sort());
        },
        autoStartRepl: false, includePackageModules: false
      });
      expect(snapshots).toEqual([['first'], ['first', 'second']]);
    });

    test('onBeforeRepl fires after all init, with the full module map', async () => {
      fakeModule(tmpDir, 'a', `
        let initDone = false;
        export const metadata = { prefix: 'a' };
        export async function init() { initDone = true; }
        export function isInitDone() { return initDone; }
      `);
      let seen;
      await bootstrap({
        modulesDir: tmpDir,
        onBeforeRepl: ({ modules }) => {
          seen = {
            keys: Object.keys(modules),
            initDone: modules.a.isInitDone()
          };
        },
        autoStartRepl: false, includePackageModules: false
      });
      expect(seen.keys).toEqual(['a']);
      expect(seen.initDone).toBe(true);
    });
  });

  describe('dispatch chain', () => {
    test('module dispatch routes input to the module.handle', async () => {
      fakeModule(tmpDir, 'echo', `
        let lastInput = null;
        export const metadata = { prefix: 'echo' };
        export const commands = {};
        export function handle(parts) { lastInput = parts; return true; }
        export function getLastInput() { return lastInput; }
      `);
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      await handle.executeCommand('echo hello world');
      const mod = moduleRegistry.getModules().echo;
      expect(mod.getLastInput()).toEqual(['hello', 'world']);
    });

    test('pre-dispatch interceptor can claim input', async () => {
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      let saw;
      commandInterceptors.registerPreDispatch('claimer', input => {
        if (input === 'magic') {
          saw = input;
          return { handled: true };
        }
        return null;
      });
      await handle.executeCommand('magic');
      expect(saw).toBe('magic');
    });

    test('pre-dispatch interceptor can rewrite input', async () => {
      fakeModule(tmpDir, 'target', `
        let lastInput = null;
        export const metadata = { prefix: 'target' };
        export function handle(parts) { lastInput = parts; }
        export function getLastInput() { return lastInput; }
      `);
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      commandInterceptors.registerPreDispatch('rewriter', input => {
        if (input === 'shortcut') return { rewrite: 'target arg1 arg2' };
        return null;
      });
      await handle.executeCommand('shortcut');
      expect(moduleRegistry.getModules().target.getLastInput()).toEqual(['arg1', 'arg2']);
    });

    test('unknown-command interceptor fires for unmatched input', async () => {
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      let saw;
      commandInterceptors.registerUnknownCommand('fallback', parts => {
        saw = parts;
        return { handled: true };
      });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await handle.executeCommand('mystery foo');
      // unknown-command interceptor handled it — no "Unknown command" error
      expect(errSpy).not.toHaveBeenCalled();
      expect(saw).toEqual(['mystery', 'foo']);
      errSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('falls through to "Unknown command" when nothing handles input', async () => {
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await handle.executeCommand('totally-unknown-command');
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command')
      );
      errSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('plural rewrite — `<module>s` becomes `<module> list`', async () => {
      fakeModule(tmpDir, 'thing', `
        let lastInput = null;
        export const metadata = { prefix: 'thing', commands: { list: 'List things' } };
        export const commands = { list: { description: 'List', handler: () => null } };
        export function handle(parts) { lastInput = parts; }
        export function getLastInput() { return lastInput; }
      `);
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      await handle.executeCommand('things');
      expect(moduleRegistry.getModules().thing.getLastInput()).toEqual(['list']);
    });

    test('shell built-in dispatch — `wait <ms>` resolves after ms', async () => {
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      const start = Date.now();
      await handle.executeCommand('wait 50');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    test('empty input is a no-op', async () => {
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await handle.executeCommand('');
      await handle.executeCommand('   ');
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    test('dispatches by metadata.prefix when it differs from the directory name', async () => {
      // Module directory is `long-name-module` but its public prefix
      // (the one help advertises) is `shortname`. Users type
      // `shortname run`; dispatch must resolve to this module.
      fakeModule(tmpDir, 'long-name-module', `
        let lastInput = null;
        export const metadata = { prefix: 'shortname' };
        export const commands = {};
        export function handle(parts) { lastInput = parts; return true; }
        export function getLastInput() { return lastInput; }
      `);
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      await handle.executeCommand('shortname run --foo');
      const mod = moduleRegistry.getModules()['long-name-module'];
      expect(mod.getLastInput()).toEqual(['run', '--foo']);
    });

    test('dispatch by directory name still works alongside the prefix alias', async () => {
      fakeModule(tmpDir, 'long-name-module', `
        let lastInput = null;
        export const metadata = { prefix: 'shortname' };
        export const commands = {};
        export function handle(parts) { lastInput = parts; return true; }
        export function getLastInput() { return lastInput; }
      `);
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      await handle.executeCommand('long-name-module hello');
      const mod = moduleRegistry.getModules()['long-name-module'];
      expect(mod.getLastInput()).toEqual(['hello']);
    });

    test('plural rewrite resolves via metadata.prefix too', async () => {
      fakeModule(tmpDir, 'gadget-store', `
        let lastInput = null;
        export const metadata = { prefix: 'gadget' };
        export const commands = { list: { description: 'List', handler: () => null } };
        export function handle(parts) { lastInput = parts; }
        export function getLastInput() { return lastInput; }
      `);
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      await handle.executeCommand('gadgets');
      expect(moduleRegistry.getModules()['gadget-store'].getLastInput()).toEqual(['list']);
    });

    test('throws at startup when two modules collide on prefix-vs-name', async () => {
      // Module 'foo' (directory) exists. Another module declares
      // prefix='foo'. The alias collides with a real loaded module.
      fakeModule(tmpDir, 'foo', `
        export const metadata = { prefix: 'foo' };
        export const commands = {};
      `);
      fakeModule(tmpDir, 'bar', `
        export const metadata = { prefix: 'foo' };
        export const commands = {};
      `);
      await expect(
        bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false })
      ).rejects.toThrow(/collides/);
    });
  });

  describe('getModules() with prefix aliases', () => {
    test('returns one entry per module (no duplicate from prefix alias)', async () => {
      fakeModule(tmpDir, 'long-name-module', `
        export const metadata = { prefix: 'shortname' };
        export const commands = {};
      `);
      await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      const keys = Object.keys(moduleRegistry.getModules());
      expect(keys).toEqual(['long-name-module']);
    });
  });

  describe('shutdown', () => {
    test('shutdown handle runs the shutdown chain (test mode does not exit)', async () => {
      const handle = await bootstrap({ modulesDir: tmpDir, autoStartRepl: false, includePackageModules: false });
      const order = [];
      shutdownService.onShutdown('a', () => { order.push('a'); });
      shutdownService.onShutdown('b', () => { order.push('b'); });
      await handle.shutdown('test');
      // LIFO: b registered after a → b runs first
      expect(order).toEqual(['b', 'a']);
      expect(shutdownService.hasShutdownRun()).toBe(true);
    });

    test('extraOnShutdown registered via options fires as part of the chain', async () => {
      let consumerCleanupRan = false;
      const handle = await bootstrap({
        modulesDir: tmpDir,
        onShutdown: () => { consumerCleanupRan = true; },
        autoStartRepl: false, includePackageModules: false
      });
      await handle.shutdown('test');
      expect(consumerCleanupRan).toBe(true);
    });
  });

  describe('module cross-wiring via getModules', () => {
    test('a module loaded later can read modules loaded before it via getModules', async () => {
      fakeModule(tmpDir, 'producer', `
        export const metadata = { prefix: 'producer' };
        export const value = 42;
      `);
      // The consumer module reads the registry from server-cli-core directly.
      // Use the absolute path to the package's module-registry.js so the
      // dynamic import from a tmp-dir module can resolve it.
      const registryPath = path.resolve('lib/module-registry.js');
      fakeModule(tmpDir, 'consumer', `
        import { getModules } from ${JSON.stringify(registryPath)};
        let captured;
        export const metadata = { prefix: 'consumer' };
        export function init() { captured = getModules().producer?.value; }
        export function getCaptured() { return captured; }
      `);
      await bootstrap({
        modulesDir: tmpDir,
        loadOrder: ['producer', 'consumer'],
        autoStartRepl: false, includePackageModules: false
      });
      const cap = moduleRegistry.getModules().consumer.getCaptured();
      expect(cap).toBe(42);
    });
  });
});
