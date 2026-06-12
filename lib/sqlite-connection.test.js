/**
 * Tests for lib/sqlite-connection.js — lazy/shared SQLite lifecycle.
 */

import { describe, test, expect, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { openDatabase, closeDatabase, closeAll } from './sqlite-connection.js';

describe('lib/sqlite-connection.js', () => {
  const created = [];

  function tmpDbPath(label) {
    const p = path.join(os.tmpdir(), `scc-sqlite-${label}-${process.pid}-${created.length}.db`);
    created.push(p);
    return p;
  }

  afterEach(() => {
    closeAll();
    for (const p of created.splice(0)) {
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const f = p + suffix;
        if (fs.existsSync(f)) fs.rmSync(f, { force: true });
      }
    }
  });

  test('opens a database at an explicit dbPath', () => {
    const dbPath = tmpDbPath('open');
    const db = openDatabase('ignored', { dbPath });
    expect(db.open).toBe(true);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  test('returns the same cached instance for the same path', () => {
    const dbPath = tmpDbPath('cache');
    const a = openDatabase('x', { dbPath });
    const b = openDatabase('x', { dbPath });
    expect(a).toBe(b);
  });

  test('returns distinct instances for different paths', () => {
    const a = openDatabase('a', { dbPath: tmpDbPath('distinct-a') });
    const b = openDatabase('b', { dbPath: tmpDbPath('distinct-b') });
    expect(a).not.toBe(b);
  });

  test('applies pragmas on first open', () => {
    const dbPath = tmpDbPath('pragma');
    const db = openDatabase('p', { dbPath, pragmas: { foreign_keys: 'ON' } });
    const [{ foreign_keys: fk }] = db.pragma('foreign_keys');
    expect(fk).toBe(1);
  });

  test('closeDatabase closes by explicit path and drops the cache entry', () => {
    const dbPath = tmpDbPath('close-path');
    const db = openDatabase('c', { dbPath });
    closeDatabase(dbPath);
    expect(db.open).toBe(false);
    // After close, a fresh open returns a new instance.
    const reopened = openDatabase('c', { dbPath });
    expect(reopened).not.toBe(db);
  });

  test('closeDatabase resolves a bare name to <cwd>/<name>.db', () => {
    const name = `scc-named-${process.pid}`;
    const expectedPath = path.resolve(process.cwd(), `${name}.db`);
    created.push(expectedPath);

    const db = openDatabase(name);
    expect(db.open).toBe(true);

    closeDatabase(name);
    expect(db.open).toBe(false);
  });

  test('closeDatabase on an unknown name is a no-op', () => {
    expect(() => closeDatabase('does-not-exist-anywhere')).not.toThrow();
  });

  test('closeAll closes every open database and clears the cache', () => {
    const a = openDatabase('a', { dbPath: tmpDbPath('all-a') });
    const b = openDatabase('b', { dbPath: tmpDbPath('all-b') });

    closeAll();

    expect(a.open).toBe(false);
    expect(b.open).toBe(false);
  });

  test('closeAll swallows errors from an already-closed db', () => {
    const dbPath = tmpDbPath('all-error');
    const db = openDatabase('e', { dbPath });
    db.close(); // close out from under the cache
    // closeAll will try to close it again — must not throw.
    expect(() => closeAll()).not.toThrow();
  });
});
