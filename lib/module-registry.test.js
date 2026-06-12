/**
 * Tests for lib/module-registry.js — the in-memory loaded-module registry.
 */

import { describe, test, expect, afterEach } from '@jest/globals';

import { setModules, getModules, clearModules } from './module-registry.js';

describe('lib/module-registry.js', () => {
  afterEach(() => {
    clearModules();
  });

  test('getModules starts empty after a clear', () => {
    clearModules();
    expect(getModules()).toEqual({});
  });

  test('setModules replaces the registry', () => {
    const map = { a: { metadata: {} }, b: {} };
    setModules(map);
    expect(getModules()).toBe(map);
  });

  test('setModules(null) falls back to an empty object', () => {
    setModules({ a: {} });
    setModules(null);
    expect(getModules()).toEqual({});
  });

  test('setModules(undefined) falls back to an empty object', () => {
    setModules();
    expect(getModules()).toEqual({});
  });

  test('clearModules empties a populated registry', () => {
    setModules({ a: {} });
    clearModules();
    expect(getModules()).toEqual({});
  });
});
