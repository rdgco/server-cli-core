/**
 * Shutdown Service
 *
 * Shell-bound infrastructure: a single registry of cleanup handlers
 * that runs on application exit, replacing the prior fragmented
 * pattern (per-module signal handlers, `getQuitConfirmedHandler`
 * exports, ad-hoc cleanup blocks in `emergencyShutdown` /
 * `exitApplication`).
 *
 * Modules subscribe at module-load time:
 *
 *   import { onShutdown } from 'server-cli-core';
 *   onShutdown('myservice', async () => { await myService.stop(); });
 *
 * The shell owns the actual signal handlers
 * (SIGINT / SIGTERM / uncaughtException / unhandledRejection) and
 * calls `runShutdown(reason)` exactly once.
 *
 * Order: handlers run **LIFO** — the last registered is the first
 * to shut down. Because ESM module load order follows the import
 * graph, this equals reverse-dependency order without anyone
 * having to declare dependencies. The shell registers its own
 * cleanups (DB close, history save, etc.) BEFORE loading modules,
 * so those run last.
 *
 * Safety:
 * - Each handler gets a per-handler timeout (default 2000ms).
 * - Errors in one handler are logged and don't stop the others.
 * - `runShutdown` is idempotent — second call is a no-op.
 */

const _handlers = []; // [{ name, fn }] in registration order
let _isRunning = false;
let _hasRun = false;

const DEFAULT_HANDLER_TIMEOUT_MS = 2000;

/**
 * Register a cleanup handler. Called at module-load time.
 *
 * @param {string} name - Identifier for logs (typically the module name)
 * @param {Function} fn - Async or sync function. Receives no arguments.
 */
export function onShutdown(name, fn) {
  if (typeof fn !== 'function') {
    throw new Error(`[Shutdown] onShutdown('${name}', fn): fn must be a function`);
  }
  _handlers.push({ name, fn });
}

/**
 * Run every registered handler in LIFO order. Idempotent — only the
 * first call has any effect.
 *
 * @param {string} reason - Why shutdown was triggered (logged)
 * @param {Object} [options]
 * @param {number} [options.handlerTimeoutMs=2000] - Max ms per handler
 * @returns {Promise<void>}
 */
export async function runShutdown(reason, options = {}) {
  if (_isRunning || _hasRun) return;
  _isRunning = true;

  const handlerTimeoutMs = options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;

  console.log(`[Shutdown] ${reason}`);

  // LIFO: last registered = first to shut down
  for (let i = _handlers.length - 1; i >= 0; i--) {
    const handler = _handlers[i];
    let timeoutId = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`timeout after ${handlerTimeoutMs}ms`)),
          handlerTimeoutMs
        );
      });
      await Promise.race([
        Promise.resolve().then(() => handler.fn()),
        timeoutPromise
      ]);
      console.log(`[Shutdown] ✓ ${handler.name}`);
    } catch (e) {
      console.error(`[Shutdown] ✗ ${handler.name}: ${e.message}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  _hasRun = true;
  _isRunning = false;
}

/**
 * @returns {boolean} Whether `runShutdown` has already completed.
 */
export function hasShutdownRun() {
  return _hasRun;
}

/**
 * @returns {boolean} Whether `runShutdown` is currently in progress.
 */
export function isShuttingDown() {
  return _isRunning;
}

/**
 * Clear all registered handlers and reset state.
 *
 * Test-only. Production code never calls this.
 */
export function _resetForTests() {
  _handlers.length = 0;
  _isRunning = false;
  _hasRun = false;
}

export default { onShutdown, runShutdown, hasShutdownRun, isShuttingDown };
