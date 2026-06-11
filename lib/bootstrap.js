/**
 * bootstrap — public entry point for `server-cli-core`.
 *
 * Spins up the modular CLI shell: discovers and loads the consumer's
 * modules, runs each module's `init()`, fires consumer hooks at the
 * right phase, registers the shell-level shutdown chain, wires
 * signal handlers, and (by default) starts the REPL.
 *
 * The two-mode design (`autoStartRepl: true` for production,
 * `false` for tests) keeps the same code path live in both
 * environments while preventing tests from hijacking stdin or
 * triggering `process.exit`.
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { onShutdown, runShutdown } from './shutdown-service.js';
import { closeAll as closeAllDatabases } from './sqlite-connection.js';
import { setModules } from './module-registry.js';
import { tryShellBuiltin, applyPluralRewrite, moduleHasListCommand } from './shell-builtins.js';
import { runPreDispatch, runUnknownCommand } from './command-interceptors.js';
import { loadHistory, saveHistory } from './history.js';
import { log, logDebug, logErrorMessage } from '../modules/log/logger.js';

// The package's own bundled modules (log, help, history, quit) live here.
// Discovered alongside the consumer's modulesDir so consumers always get them
// without having to wire them up manually. Consumers can override by name —
// a same-named module in the consumer's modulesDir wins.
const PACKAGE_MODULES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'modules'
);

/**
 * @typedef {Object} BootstrapOptions
 * @property {string} modulesDir
 *   Required. Absolute path to the consumer's modules/ directory.
 *   Each subdirectory `<name>/` is expected to contain a
 *   `<name>-commands.js` entry file.
 * @property {string[]} [loadOrder=[]]
 *   Module names to load first, in the order given. Any modules
 *   not listed here load alphabetically afterwards.
 * @property {(name: string, module: object) => void|Promise<void>} [onModuleLoaded]
 *   Fires after each module loads (and after the registry has been
 *   updated). Use for cross-module wiring that needs to see the
 *   current registry state via `getModules()`.
 * @property {string} [promptText='> ']
 *   REPL prompt string.
 * @property {string} [banner='']
 *   Printed once after init, before the REPL prompts.
 * @property {string} [historyFile]
 *   Path to the readline history file. If omitted, history is
 *   not persisted across runs.
 * @property {number} [historySize=1000]
 *   In-memory history size for the readline interface.
 * @property {(ctx: { modules: object }) => Promise<void>} [onBeforeRepl]
 *   Fires after every module's `init()` completes, before the
 *   REPL starts. Use for project-specific startup tasks that
 *   need the full module set to be live.
 * @property {() => Promise<void>} [onShutdown]
 *   Extra cleanup, fires at the END of the shutdown chain (after
 *   every module's own cleanup and the shell defaults).
 * @property {string} [farewell='']
 *   Printed at shutdown.
 * @property {boolean} [autoStartRepl=true]
 *   Production default. When `false`, no readline interface is
 *   created, no signal handlers are installed, and the returned
 *   `shutdown` does not call `process.exit`. Designed for tests
 *   that want to drive the dispatch chain via `executeCommand`
 *   without hijacking stdin.
 * @property {boolean} [includePackageModules=true]
 *   When `true` (default), bootstrap auto-discovers the package's
 *   own bundled modules (log, help, history, quit) alongside the
 *   consumer's modulesDir. Same-named modules in the consumer's
 *   modulesDir override the package's defaults. Set `false` to
 *   load ONLY the consumer's modules — useful for tests that want
 *   strict assertions on the loaded module list, or for consumers
 *   that ship their own log/help/history/quit and don't want the
 *   bundled ones loaded.
 */

/**
 * @typedef {Object} BootstrapHandle
 * @property {(input: string) => Promise<void>} executeCommand
 *   Programmatically run an input string through the same
 *   dispatch chain the REPL uses.
 * @property {(reason?: string) => Promise<void>} shutdown
 *   Trigger the shutdown chain. In production mode, calls
 *   `process.exit` at the end; in test mode, just runs the chain.
 */

/**
 * @param {BootstrapOptions} options
 * @returns {Promise<BootstrapHandle>}
 */
export async function bootstrap(options) {
  if (!options || !options.modulesDir) {
    throw new Error('bootstrap({ modulesDir }) is required');
  }

  const {
    modulesDir,
    loadOrder = [],
    onModuleLoaded,
    promptText = '> ',
    banner = '',
    historyFile,
    historySize = 1000,
    onBeforeRepl,
    onShutdown: extraOnShutdown,
    farewell = '',
    autoStartRepl = true,
    includePackageModules = true
  } = options;

  let rl = null;
  let isShuttingDown = false;

  // ==========================================================================
  // Shutdown-chain registration (runs LIFO; these register first → run last)
  // ==========================================================================

  if (farewell) {
    onShutdown('farewell', () => { console.log(farewell); });
  }

  if (historyFile) {
    onShutdown('save-history', () => {
      if (rl?.history) saveHistory(rl.history);
    });
  }

  onShutdown('close-databases', () => closeAllDatabases());

  if (extraOnShutdown) {
    onShutdown('consumer-shutdown', extraOnShutdown);
  }

  async function shutdown(reason = 'manual', exitCode = 0, error = null) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (error?.stack) console.error(error.stack);

    // Belt-and-braces upper bound on the whole chain. Each handler
    // already has its own per-handler timeout via shutdown-service.
    const forceExitTimer = setTimeout(() => {
      console.error('[Shutdown] Cleanup timed out, forcing exit');
      if (autoStartRepl) process.exit(exitCode);
    }, 5000);
    forceExitTimer.unref();

    await runShutdown(reason);

    clearTimeout(forceExitTimer);
    if (rl?.close) rl.close();
    if (autoStartRepl) process.exit(exitCode);
  }

  // ==========================================================================
  // Signal & crash handlers (production mode only)
  // ==========================================================================

  if (autoStartRepl) {
    process.on('uncaughtException', err => {
      console.error(`\n[Shutdown] Uncaught exception: ${err.message}`);
      shutdown('crash:uncaughtException', 1, err);
    });

    process.on('unhandledRejection', reason => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      console.error(`\n[Shutdown] Unhandled rejection: ${err.message}`);
      shutdown('crash:unhandledRejection', 1, err);
    });

    process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  }

  // ==========================================================================
  // Module discovery + loading (priority list, then alphabetical)
  // ==========================================================================

  const loaded = {};

  async function loadOne(name, sourceDir) {
    const commandsPath = path.join(sourceDir, name, `${name}-commands.js`);
    if (!fs.existsSync(commandsPath)) return;
    try {
      const mod = await import(commandsPath);
      loaded[name] = mod;
      setModules(loaded); // refresh registry incrementally so cross-wiring sees what's loaded so far
      logDebug(`[Startup] Loaded module: ${name}`);
      if (onModuleLoaded) await onModuleLoaded(name, mod);
    } catch (err) {
      console.error(`[Startup] FATAL: Failed to load module ${name}: ${err.message}`);
      throw err;
    }
  }

  log('[Startup] Loading modules...');

  // Build a map of name → sourceDir, layering the consumer's modulesDir
  // on top of the package's own bundled modules. Same-named entries
  // from the consumer override the package's defaults.
  const sourceDirs = includePackageModules
    ? [PACKAGE_MODULES_DIR, modulesDir]
    : [modulesDir];
  const moduleSources = new Map();
  for (const dir of sourceDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const commandsPath = path.join(dir, d.name, `${d.name}-commands.js`);
      if (fs.existsSync(commandsPath)) moduleSources.set(d.name, dir);
    }
  }

  const candidates = Array.from(moduleSources.keys());
  const ordered = loadOrder.filter(n => moduleSources.has(n));
  const remaining = candidates.filter(n => !ordered.includes(n)).sort();
  for (const name of [...ordered, ...remaining]) {
    await loadOne(name, moduleSources.get(name));
  }

  log('[Startup] All modules loaded');

  for (const [name, mod] of Object.entries(loaded)) {
    if (typeof mod.init === 'function') {
      try {
        logDebug(`[Startup] Initializing module: ${name}`);
        await mod.init();
      } catch (err) {
        const continueOnFailure = mod.metadata?.continueOnInitFailure === true;
        if (continueOnFailure) {
          logErrorMessage(`[Startup] Warning: Module ${name} init failed (continuing): ${err.message}`);
        } else {
          if (err.isClean) {
            console.error(`\n${err.message}\n`);
          } else {
            console.error(`[Startup] FATAL: Module ${name} init failed: ${err.message}`);
            logDebug(`[Startup] Stack trace: ${err.stack}`);
          }
          throw err;
        }
      }
    }
  }

  if (onBeforeRepl) {
    await onBeforeRepl({ modules: loaded });
  }

  // Banner prints after init/hooks and before the prompt. Emitted in
  // both modes so tests can verify it; in production it lands right
  // before the first prompt as expected.
  if (banner) console.log(banner);

  // ==========================================================================
  // Tab-completion (delegates to module.autocomplete with plural-rewrite)
  // ==========================================================================

  function completer(line) {
    const trimmed = line.trim();
    const parts = trimmed.split(/\s+/).filter(p => p);
    const hasTrailingSpace = line.length > 0 && line[line.length - 1] === ' ';

    if (parts.length === 1 && hasTrailingSpace) {
      let moduleName = parts[0];
      if (!loaded[moduleName] && moduleName.endsWith('s')) {
        const singular = moduleName.slice(0, -1);
        if (loaded[singular] && moduleHasListCommand(loaded[singular])) moduleName = singular;
      }
      const mod = loaded[moduleName];
      if (mod && typeof mod.autocomplete === 'function') {
        return mod.autocomplete([moduleName, ''], line);
      }
    }

    if (parts.length === 1 && !hasTrailingSpace) {
      const names = Object.keys(loaded);
      const hits = names.filter(n => n.startsWith(parts[0]));
      const pluralHits = [];
      names.forEach(n => {
        const plural = n + 's';
        if (plural.startsWith(parts[0]) && moduleHasListCommand(loaded[n])) pluralHits.push(plural);
      });
      const allHits = [...hits, ...pluralHits];
      return [allHits.length ? allHits : names, parts[0]];
    }

    if (parts.length >= 1) {
      let moduleName = parts[0];
      if (!loaded[moduleName] && moduleName.endsWith('s')) {
        const singular = moduleName.slice(0, -1);
        if (loaded[singular] && moduleHasListCommand(loaded[singular])) moduleName = singular;
      }
      const mod = loaded[moduleName];
      if (mod && typeof mod.autocomplete === 'function') {
        const acParts = [...parts];
        if (hasTrailingSpace) acParts.push('');
        return mod.autocomplete(acParts, line);
      }
    }

    return [[], line];
  }

  // ==========================================================================
  // 6-layer dispatch chain
  // ==========================================================================

  async function executeCommand(input) {
    return handleCommand(input);
  }

  async function handleCommand(input) {
    // Layer 1 — pre-dispatch interceptors
    const preResult = await runPreDispatch(input);
    if (preResult?.handled) return;
    if (preResult?.rewrite) {
      logDebug(`[Main] Pre-dispatch rewrite: '${input}' → '${preResult.rewrite}'`);
      return handleCommand(preResult.rewrite);
    }

    const rawParts = input.split(' ').filter(p => p);
    if (rawParts.length === 0) return;
    rawParts[0] = rawParts[0].toLowerCase();

    // Layer 2 — shell built-ins (clear, wait)
    const builtinResult = await tryShellBuiltin(rawParts);
    if (builtinResult?.handled) return;

    // Layer 3 — plural rewrite (`routes` → `route list`)
    const parts = applyPluralRewrite(rawParts, loaded);
    if (parts !== rawParts) {
      logDebug(`[Main] Plural rewrite: '${rawParts[0]}' → '${parts[0]} ${parts[1]}'`);
    }

    const moduleName = parts[0];
    const commandParts = parts.slice(1);

    // Layer 4 — module dispatch
    if (loaded[moduleName]) {
      const mod = loaded[moduleName];
      if (typeof mod.handle === 'function') {
        try {
          const result = await mod.handle(commandParts);
          if (result === 'exit') await shutdown('user-quit', 0);
        } catch (err) {
          console.error(`Error in ${moduleName} module:`, err.message);
          logDebug(`[Main] Error in ${moduleName} module:`, err);
          throw err;
        }
      } else {
        console.error(`Module ${moduleName} does not have a handle function`);
      }
      return;
    }

    // Layer 5 — unknown-command interceptors
    const unknownResult = await runUnknownCommand([moduleName, ...commandParts]);
    if (unknownResult?.handled) return;

    // Layer 6 — give up
    console.error(`Unknown command: ${moduleName}`);
    console.log('Type "help" for available commands');
  }

  // ==========================================================================
  // REPL setup (production mode only)
  // ==========================================================================

  if (autoStartRepl) {
    const commandHistory = historyFile ? loadHistory() : [];

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer,
      history: commandHistory,
      historySize,
      removeHistoryDuplicates: true
    });

    function startPrompt() {
      rl.question(promptText, async input => {
        if (input && input.trim()) {
          const trimmed = input.trim();
          if (historyFile) saveHistory(rl.history || []);
          try {
            await handleCommand(trimmed);
          } catch (_e) {
            // already logged by handleCommand
          }
        }
        startPrompt();
      });
    }

    // SIGINT (Ctrl+C). First press nudges; second press inside 3s exits.
    let sigintCount = 0;
    rl.on('SIGINT', () => {
      sigintCount++;
      if (sigintCount >= 2) {
        shutdown('Double Ctrl+C', 0);
        return;
      }
      console.log('\nUse "quit" command to exit (press Ctrl+C again to force)');
      setTimeout(() => { sigintCount = 0; }, 3000);
      startPrompt();
    });

    startPrompt();
  }

  return { executeCommand, shutdown };
}
