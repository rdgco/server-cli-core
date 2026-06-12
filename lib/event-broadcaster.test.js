/**
 * Tests for lib/event-broadcaster.js — generic WebSocket pub/sub.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

import {
  initBroadcaster,
  setStateProvider,
  broadcastEvent,
  broadcastStateUpdate
} from './event-broadcaster.js';

// WebSocket.OPEN === 1; anything else is treated as not-open.
const OPEN = 1;
const CLOSING = 2;

function fakeClient(readyState = OPEN) {
  return { readyState, send: jest.fn() };
}

describe('lib/event-broadcaster.js', () => {
  beforeEach(() => {
    // Reset module state between tests by clearing the client set
    // and state provider back to empty/no-op shapes.
    initBroadcaster(new Set());
    setStateProvider(null);
  });

  describe('broadcastEvent()', () => {
    test('does nothing when no clients are registered', () => {
      // No clients set → just returns without throwing.
      expect(() => broadcastEvent('thing:changed', { a: 1 })).not.toThrow();
    });

    test('sends a JSON envelope to every OPEN client', () => {
      const a = fakeClient(OPEN);
      const b = fakeClient(OPEN);
      initBroadcaster(new Set([a, b]));

      broadcastEvent('cue:changed', { id: 7 });

      expect(a.send).toHaveBeenCalledTimes(1);
      expect(b.send).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(a.send.mock.calls[0][0]);
      expect(payload.type).toBe('cue:changed');
      expect(payload.data).toEqual({ id: 7 });
      expect(typeof payload.timestamp).toBe('number');
    });

    test('skips clients that are not OPEN', () => {
      const open = fakeClient(OPEN);
      const closing = fakeClient(CLOSING);
      initBroadcaster(new Set([open, closing]));

      broadcastEvent('evt');

      expect(open.send).toHaveBeenCalledTimes(1);
      expect(closing.send).not.toHaveBeenCalled();
    });

    test('defaults data to an empty object', () => {
      const c = fakeClient(OPEN);
      initBroadcaster(new Set([c]));

      broadcastEvent('evt');

      const payload = JSON.parse(c.send.mock.calls[0][0]);
      expect(payload.data).toEqual({});
    });
  });

  describe('broadcastStateUpdate()', () => {
    test('does nothing without a state provider', async () => {
      const c = fakeClient(OPEN);
      initBroadcaster(new Set([c]));
      // No state provider registered.
      await broadcastStateUpdate();
      expect(c.send).not.toHaveBeenCalled();
    });

    test('does nothing when there are no clients', async () => {
      const provider = jest.fn(async () => ({ ok: true }));
      setStateProvider(provider);
      await broadcastStateUpdate();
      expect(provider).not.toHaveBeenCalled();
    });

    test('broadcasts full state from the provider to OPEN clients', async () => {
      const open = fakeClient(OPEN);
      const closed = fakeClient(CLOSING);
      initBroadcaster(new Set([open, closed]));
      setStateProvider(async () => ({ counter: 3 }));

      await broadcastStateUpdate();

      expect(open.send).toHaveBeenCalledTimes(1);
      expect(closed.send).not.toHaveBeenCalled();

      const payload = JSON.parse(open.send.mock.calls[0][0]);
      expect(payload).toEqual({ type: 'state', state: { counter: 3 } });
    });
  });
});
