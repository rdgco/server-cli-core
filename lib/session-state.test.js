import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sessionState, { configure, get, set, exists, destroy } from './session-state.js';

describe('session-state', () => {
  let tmpFile;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-state-test-'));
    tmpFile = path.join(tmpDir, 'session-state.json');
    configure({ filePath: tmpFile });
  });

  afterEach(() => {
    try { destroy(); } catch (_e) { /* best effort */ }
    try { fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  });

  describe('basic KV', () => {
    test('get returns null for unset namespace', () => {
      expect(get('nope')).toBeNull();
    });

    test('set + get roundtrips', () => {
      set('cursor', { row: 1, col: 2 });
      expect(get('cursor')).toEqual({ row: 1, col: 2 });
    });

    test('exists reflects backing file presence', () => {
      expect(exists()).toBe(false);
      set('prefs', { theme: 'dark' });
      expect(exists()).toBe(true);
    });

    test('corrupted JSON falls back to empty doc with a logged error', () => {
      fs.writeFileSync(tmpFile, '{not valid json');
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      configure({ filePath: tmpFile });

      expect(get('anything')).toBeNull();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe('update / clear / destroy', () => {
    test('update merges via callback', () => {
      sessionState.set('prefs', { theme: 'dark' });
      sessionState.update('prefs', cur => ({ ...cur, fontSize: 14 }));
      expect(sessionState.get('prefs')).toEqual({ theme: 'dark', fontSize: 14 });
    });

    test('update on unset namespace receives empty object', () => {
      sessionState.update('fresh', cur => ({ ...cur, created: true }));
      expect(sessionState.get('fresh')).toEqual({ created: true });
    });

    test('clear removes a namespace, leaves others alone', () => {
      sessionState.set('keep', { value: 1 });
      sessionState.set('drop', { value: 2 });
      sessionState.clear('drop');
      expect(sessionState.get('drop')).toBeNull();
      expect(sessionState.get('keep')).toEqual({ value: 1 });
    });

    test('has returns true only when the namespace is set', () => {
      expect(sessionState.has('absent')).toBe(false);
      sessionState.set('present', { value: 42 });
      expect(sessionState.has('present')).toBe(true);
    });

    test('destroy deletes the backing file', () => {
      sessionState.set('cursor', { row: 1 });
      expect(sessionState.exists()).toBe(true);
      sessionState.destroy();
      expect(sessionState.exists()).toBe(false);
    });
  });
});
