/**
 * Shared SQLite Connection Helper
 *
 * Shell-bound infrastructure: lazy open + shared instance + close-all
 * for any SQLite database the host needs. Replaces the per-module
 * pattern where each persistence layer opened its own better-sqlite3
 * connection independently.
 *
 * Usage:
 *
 *   import { openDatabase, closeAll } from 'server-cli-core';
 *
 *   // Default location: <cwd>/<name>.db
 *   const db = openDatabase('myapp', {
 *     pragmas: { foreign_keys: 'ON' }
 *   });
 *
 *   // Or override the path entirely (useful for project-specific
 *   // resolution or test fixtures):
 *   const testDb = openDatabase('myapp', {
 *     dbPath: '/tmp/myapp-test.db',
 *     pragmas: { foreign_keys: 'ON' }
 *   });
 *
 *   // On shutdown:
 *   closeAll();
 *
 * Design notes:
 * - The cache is keyed by the resolved absolute dbPath, not the name,
 *   so two `openDatabase('myapp', { dbPath: ... })` calls with
 *   different paths return distinct instances.
 * - No opinionated pragmas. Consumers pass exactly what they want via
 *   `options.pragmas`. The helper only handles connection lifecycle.
 * - No schema or migration logic. Each consumer keeps its own.
 */

import Database from 'better-sqlite3';
import path from 'path';

const _instances = new Map(); // dbPath → Database instance

/**
 * Open (or return cached) a SQLite database.
 *
 * @param {string} name - DB name (without .db extension); used to
 *   compute the default path as `<cwd>/<name>.db` when no explicit
 *   `dbPath` is provided.
 * @param {Object} [options]
 * @param {string} [options.dbPath] - Absolute path override. If given,
 *   the `name` is ignored for path computation.
 * @param {boolean} [options.readonly=false] - Open in read-only mode.
 * @param {Object} [options.pragmas] - Map of pragma name → value to
 *   apply on first open. Example: `{ foreign_keys: 'ON', journal_mode: 'WAL' }`.
 * @returns {Database}
 */
export function openDatabase(name, options = {}) {
  const dbPath = options.dbPath ?? path.resolve(process.cwd(), `${name}.db`);

  if (_instances.has(dbPath)) return _instances.get(dbPath);

  const db = new Database(dbPath, { readonly: options.readonly || false });

  if (options.pragmas) {
    for (const [pragma, value] of Object.entries(options.pragmas)) {
      db.pragma(`${pragma} = ${value}`);
    }
  }

  _instances.set(dbPath, db);
  return db;
}

/**
 * Close a SQLite database and remove it from the cache.
 *
 * Accepts either the same `name` passed to `openDatabase` (resolves
 * to the default `<cwd>/<name>.db` path) or an absolute `dbPath` if
 * one was used at open time.
 *
 * @param {string} nameOrPath
 */
export function closeDatabase(nameOrPath) {
  let dbPath = nameOrPath;
  if (!_instances.has(dbPath)) {
    dbPath = path.resolve(process.cwd(), `${nameOrPath}.db`);
  }
  const db = _instances.get(dbPath);
  if (db) {
    db.close();
    _instances.delete(dbPath);
  }
}

/**
 * Close every open database. Safe to call from emergency shutdown.
 */
export function closeAll() {
  for (const db of _instances.values()) {
    try {
      db.close();
    } catch (_e) {
      // Best-effort during shutdown — keep going so the next DB still closes.
    }
  }
  _instances.clear();
}
