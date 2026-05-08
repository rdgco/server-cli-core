import { isModuleStatus, unknownStatus } from './status-contract.js';

describe('status-contract', () => {
  describe('isModuleStatus', () => {
    test('accepts a minimal valid status', () => {
      expect(isModuleStatus({ level: 'ok', summary: '3 connected' })).toBe(true);
    });

    test('accepts a fully-populated status', () => {
      expect(isModuleStatus({
        level: 'warning',
        summary: '2 of 3 active',
        details: [{ icon: 'ok', text: 'foo', detail: '(open)' }],
        issues: [{ message: 'bar disconnected', fix: 'bar connect' }],
        raw: { foo: 1, bar: 2 }
      })).toBe(true);
    });

    test('every level constant is accepted', () => {
      for (const level of ['ok', 'warning', 'error', 'unknown']) {
        expect(isModuleStatus({ level, summary: 'x' })).toBe(true);
      }
    });

    test('rejects unknown level value', () => {
      expect(isModuleStatus({ level: 'critical', summary: 'x' })).toBe(false);
    });

    test('rejects missing summary', () => {
      expect(isModuleStatus({ level: 'ok' })).toBe(false);
    });

    test('rejects non-string summary', () => {
      expect(isModuleStatus({ level: 'ok', summary: 42 })).toBe(false);
    });

    test('rejects details that is not an array', () => {
      expect(isModuleStatus({ level: 'ok', summary: 'x', details: { text: 'foo' } })).toBe(false);
    });

    test('rejects issues that is not an array', () => {
      expect(isModuleStatus({ level: 'ok', summary: 'x', issues: { message: 'foo' } })).toBe(false);
    });

    test('rejects null / undefined / array / primitives', () => {
      expect(isModuleStatus(null)).toBe(false);
      expect(isModuleStatus(undefined)).toBe(false);
      expect(isModuleStatus([])).toBe(false);
      expect(isModuleStatus('ok')).toBe(false);
      expect(isModuleStatus(42)).toBe(false);
    });
  });

  describe('unknownStatus', () => {
    test('builds a contract-compliant unknown row with the given reason', () => {
      const status = unknownStatus('module not loaded');
      expect(isModuleStatus(status)).toBe(true);
      expect(status.level).toBe('unknown');
      expect(status.summary).toBe('module not loaded');
    });
  });
});
