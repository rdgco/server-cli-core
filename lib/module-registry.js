/**
 * Module Registry
 *
 * Generic in-memory registry of the consumer's loaded modules.
 * The bootstrap layer populates this at startup; modules that need
 * to walk every loaded module (e.g. the `help` command) read from
 * here.
 *
 * Same shape as `lib/session-state.js` — a small singleton with
 * set/get/clear semantics — so consumers and shell-modules talk
 * to a stable surface without anyone reaching back into a
 * specific bootstrap file.
 *
 * Usage (from a consumer's bootstrap):
 *
 *   import { setModules } from 'server-cli-core';
 *
 *   const loaded = await discoverAndLoad(modulesDir);
 *   setModules(loaded);
 *
 * Usage (from a shell module that walks the registry):
 *
 *   import { getModules } from 'server-cli-core';
 *
 *   const all = getModules();
 *   for (const [name, mod] of Object.entries(all)) { ... }
 */

let _modules = {};

/**
 * Replace the registered module map.
 * @param {Object} map - module name → module export object
 */
export function setModules(map) {
  _modules = map || {};
}

/**
 * Get the current module map. Returns an empty object if nothing
 * has been registered yet.
 * @returns {Object}
 */
export function getModules() {
  return _modules;
}

/**
 * Test/teardown helper: empty the registry.
 */
export function clearModules() {
  _modules = {};
}
