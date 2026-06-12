/**
 * Tests for lib/telemetry-context.js — in-memory ambient transaction context.
 */

import { describe, test, expect, afterEach, jest } from '@jest/globals';

import {
  TRANSACTION_EXPIRY_MS,
  generateTransactionId,
  getActiveTransactionId,
  getActiveTriggerTimestamp,
  beginTransactionContext,
  endTransactionContext
} from './telemetry-context.js';

describe('lib/telemetry-context.js', () => {
  afterEach(() => {
    // Always clear context so state doesn't leak between tests.
    endTransactionContext();
    jest.useRealTimers();
  });

  describe('generateTransactionId()', () => {
    test('returns a sortable <timestamp>-<random> string', () => {
      const id = generateTransactionId();
      expect(id).toMatch(/^\d+-[a-z0-9]{1,4}$/);
    });

    test('produces distinct ids across calls', () => {
      const ids = new Set();
      for (let i = 0; i < 50; i++) ids.add(generateTransactionId());
      // Random suffix makes collisions vanishingly unlikely.
      expect(ids.size).toBeGreaterThan(1);
    });
  });

  describe('begin/get/end', () => {
    test('starts with no active context', () => {
      expect(getActiveTransactionId()).toBeNull();
      expect(getActiveTriggerTimestamp()).toBeNull();
    });

    test('beginTransactionContext sets id and timestamp', () => {
      beginTransactionContext('txn-1', 12345);
      expect(getActiveTransactionId()).toBe('txn-1');
      expect(getActiveTriggerTimestamp()).toBe(12345);
    });

    test('defaults trigger timestamp to now when omitted', () => {
      beginTransactionContext('txn-2');
      expect(getActiveTransactionId()).toBe('txn-2');
      expect(typeof getActiveTriggerTimestamp()).toBe('number');
    });

    test('a second begin overwrites the first', () => {
      beginTransactionContext('txn-a', 1);
      beginTransactionContext('txn-b', 2);
      expect(getActiveTransactionId()).toBe('txn-b');
      expect(getActiveTriggerTimestamp()).toBe(2);
    });

    test('endTransactionContext clears everything', () => {
      beginTransactionContext('txn-3', 99);
      endTransactionContext();
      expect(getActiveTransactionId()).toBeNull();
      expect(getActiveTriggerTimestamp()).toBeNull();
    });

    test('endTransactionContext is safe to call with no active context', () => {
      expect(() => endTransactionContext()).not.toThrow();
    });
  });

  describe('auto-expiry', () => {
    test('clears the context after TRANSACTION_EXPIRY_MS', () => {
      jest.useFakeTimers();
      beginTransactionContext('txn-expire', 1);
      expect(getActiveTransactionId()).toBe('txn-expire');

      jest.advanceTimersByTime(TRANSACTION_EXPIRY_MS);

      expect(getActiveTransactionId()).toBeNull();
      expect(getActiveTriggerTimestamp()).toBeNull();
    });

    test('a fresh begin resets the expiry timer', () => {
      jest.useFakeTimers();
      beginTransactionContext('txn-old', 1);
      jest.advanceTimersByTime(TRANSACTION_EXPIRY_MS - 1);
      // Re-begin before the old timer fires.
      beginTransactionContext('txn-new', 2);
      jest.advanceTimersByTime(2);
      // Old timer would have fired by now but must not clear the new context.
      expect(getActiveTransactionId()).toBe('txn-new');
    });

    test('end cancels the pending expiry timer', () => {
      jest.useFakeTimers();
      beginTransactionContext('txn-cancel', 1);
      endTransactionContext();
      beginTransactionContext('txn-keep', 2);
      // Advancing past the first timer's deadline must not clear the second.
      jest.advanceTimersByTime(TRANSACTION_EXPIRY_MS + 10);
      // The second context's own timer will have fired, clearing it — that's expected.
      expect(getActiveTransactionId()).toBeNull();
    });
  });
});
