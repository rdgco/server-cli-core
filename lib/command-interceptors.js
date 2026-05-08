/**
 * Command-Interceptor Registry
 *
 * Lets the project (or any module) extend the shell's command
 * dispatch with project-specific behavior, without polluting the
 * shell's own dispatcher with project knowledge.
 *
 * # Two hook points
 *
 * 1. **Pre-dispatch** — sees the raw input string before any module
 *    dispatch happens. Can either *claim* the input (consume it
 *    silently) or *rewrite* it (substitute a different command line
 *    that gets re-dispatched). Used for input transformations, e.g.
 *    a project that wants to interpret `foo:bar baz:qux` shorthand
 *    as a longer canonical command:
 *
 *      `foo:bar baz:qux passthrough`
 *        → rewritten to `wire add foo:bar baz:qux passthrough`
 *
 * 2. **Unknown-command** — fires only if standard module dispatch
 *    didn't find a match. Last chance to interpret the input as
 *    something other than a module command, e.g. a fallback that
 *    treats unknown words as the name of a saved configuration:
 *
 *      `mythingy` (no `mythingy` module exists, but
 *                  `config/profiles/mythingy.json` does)
 *        → loaded as a profile
 *
 * # Order
 *
 * Each list runs in registration order. The first interceptor to
 * return a non-null result wins; later interceptors don't see the
 * input.
 *
 * # Contract
 *
 * Pre-dispatch return shape:
 *   - `null`              — pass through, try next interceptor / dispatch
 *   - `{ handled: true }` — input fully consumed, skip dispatch
 *   - `{ rewrite: '...' }`— substitute this command line and re-dispatch
 *
 * Unknown-command return shape:
 *   - `null`              — pass through to next interceptor / "Unknown" error
 *   - `{ handled: true }` — input fully consumed, skip "Unknown" error
 */

const _preDispatch = [];
const _unknownCommand = [];

/**
 * @callback PreDispatchFn
 * @param {string} input - The raw command line (already trimmed)
 * @returns {Promise<{ handled?: true; rewrite?: string } | null>}
 */

/**
 * @callback UnknownCommandFn
 * @param {string[]} parts - Tokenized command parts; parts[0] is
 *   the (lowercased) module-name candidate that failed to match.
 * @returns {Promise<{ handled: true } | null>}
 */

/**
 * Register a pre-dispatch interceptor.
 *
 * @param {string} name - Identifier for logging/debugging
 * @param {PreDispatchFn} fn
 */
export function registerPreDispatch(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`registerPreDispatch('${name}', fn): fn must be a function`);
  }
  _preDispatch.push({ name, fn });
}

/**
 * Register an unknown-command interceptor.
 *
 * @param {string} name - Identifier for logging/debugging
 * @param {UnknownCommandFn} fn
 */
export function registerUnknownCommand(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`registerUnknownCommand('${name}', fn): fn must be a function`);
  }
  _unknownCommand.push({ name, fn });
}

/**
 * Run all pre-dispatch interceptors in registration order. Returns
 * the first non-null result, or `null` if every interceptor passed.
 *
 * @param {string} input
 * @returns {Promise<{ handled?: true; rewrite?: string } | null>}
 */
export async function runPreDispatch(input) {
  for (const { fn } of _preDispatch) {
    const result = await fn(input);
    if (result?.handled || result?.rewrite) return result;
  }
  return null;
}

/**
 * Run all unknown-command interceptors. Returns the first
 * `{ handled: true }`, or `null` if every interceptor passed.
 *
 * @param {string[]} parts
 * @returns {Promise<{ handled: true } | null>}
 */
export async function runUnknownCommand(parts) {
  for (const { fn } of _unknownCommand) {
    const result = await fn(parts);
    if (result?.handled) return result;
  }
  return null;
}

/**
 * Inspection helper for tests / debug-output. Returns the registered
 * interceptor names in registration order.
 */
export function getRegistered() {
  return {
    preDispatch: _preDispatch.map(e => e.name),
    unknownCommand: _unknownCommand.map(e => e.name)
  };
}

/**
 * Test-only helper to clear all registrations. Don't call from
 * production code.
 */
export function _clearAll() {
  _preDispatch.length = 0;
  _unknownCommand.length = 0;
}
