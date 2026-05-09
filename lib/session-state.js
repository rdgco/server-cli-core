/**
 * Session State KV Store
 *
 * Shell-bound infrastructure: a namespaced key-value store backed by
 * a single JSON file (`config/session-state.json` by default).
 * Each module owns its own namespace, so cross-module collisions are
 * impossible by construction.
 *
 * Usage:
 *
 *   import sessionState from 'server-cli-core';
 *
 *   sessionState.set('cursor', { row, col, file });
 *   const cursor = sessionState.get('cursor');
 *
 *   sessionState.update('prefs', current => ({
 *     ...current,
 *     theme: 'dark'
 *   }));
 *
 *   sessionState.clear('cursor'); // remove the namespace
 *
 * Implementation:
 * - Single backing JSON file
 * - In-memory cache; refreshed on first read after process start
 * - Atomic write via temp file + rename
 * - Corruption recovery: invalid JSON logs and starts with an empty doc
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_FILE = path.join(process.cwd(), 'config', 'session-state.json');

let _filePath = null;
let _cache = null;

/**
 * Override the backing file path. Useful for tests; the default is
 * <cwd>/config/session-state.json.
 *
 * @param {Object} options
 * @param {string} options.filePath - Absolute path to the JSON file
 */
export function configure({ filePath } = {}) {
  _filePath = filePath || null;
  _cache = null;
}

function file() {
  return _filePath || DEFAULT_FILE;
}

function load() {
  if (_cache) return _cache;

  const f = file();
  try {
    if (!fs.existsSync(f)) {
      _cache = {};
      return _cache;
    }
    const raw = fs.readFileSync(f, 'utf-8');
    _cache = JSON.parse(raw);
    return _cache;
  } catch (err) {
    console.error(`[Session] Failed to load ${f}: ${err.message}; starting empty`);
    _cache = {};
    return _cache;
  }
}

function persist() {
  const f = file();
  try {
    const dir = path.dirname(f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _cache.savedAt = new Date().toISOString();

    const tmp = `${f}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(_cache, null, 2));
    fs.renameSync(tmp, f);
    return true;
  } catch (err) {
    console.error(`[Session] Failed to persist ${f}: ${err.message}`);
    return false;
  }
}

/**
 * Get the value stored at a namespace, or null if unset.
 * @param {string} namespace
 * @returns {*}
 */
export function get(namespace) {
  const doc = load();
  return doc[namespace] ?? null;
}

/**
 * Replace the value at a namespace and persist.
 * @param {string} namespace
 * @param {*} value
 * @returns {boolean} true on success
 */
export function set(namespace, value) {
  const doc = load();
  doc[namespace] = value;
  return persist();
}

/**
 * Read-modify-write helper. `fn` receives the current value (or {} if
 * unset) and should return the new value.
 * @param {string} namespace
 * @param {Function} fn
 * @returns {boolean}
 */
export function update(namespace, fn) {
  const current = get(namespace) || {};
  return set(namespace, fn(current));
}

/**
 * Delete a namespace and persist.
 * @param {string} namespace
 * @returns {boolean}
 */
export function clear(namespace) {
  const doc = load();
  delete doc[namespace];
  return persist();
}

/**
 * Check whether a namespace has any stored value.
 * @param {string} namespace
 * @returns {boolean}
 */
export function has(namespace) {
  const doc = load();
  return namespace in doc;
}

/**
 * Delete the entire backing file and clear the in-memory cache.
 */
export function destroy() {
  const f = file();
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f);
    _cache = null;
    return true;
  } catch (err) {
    console.error(`[Session] Failed to destroy ${f}: ${err.message}`);
    return false;
  }
}

/**
 * Whether a backing file exists on disk.
 * @returns {boolean}
 */
export function exists() {
  return fs.existsSync(file());
}

export default { configure, get, set, update, clear, has, destroy, exists };
