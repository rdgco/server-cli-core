/**
 * Event Broadcaster (generic primitives)
 *
 * Generic WebSocket pub/sub for a long-running CLI server. Modules
 * call `broadcastEvent(name, payload)` to push to connected clients;
 * the server wires up the client set via `initBroadcaster(clients)`
 * and an optional state-fetcher via `setStateProvider(fn)` for
 * full-state broadcasts.
 *
 * Consumer-specific typed broadcast helpers (e.g., `broadcastFooChanged`,
 * `broadcastBarStatus`) live in the consumer's own module and call
 * `broadcastEvent` from here. This file is domain-agnostic.
 */

import { logDebug } from '../modules/log/logger.js';

// Reference to WebSocket clients (set by the server bootstrap)
let wsClients = null;

// State-provider callback (set by the server bootstrap; returns full
// state for broadcastStateUpdate)
let stateProvider = null;

/**
 * Initialize the broadcaster with a set of WebSocket clients.
 * The server bootstrap calls this once at startup with the
 * `Set<WebSocket>` it maintains.
 *
 * @param {Set} clients - Set of WebSocket clients
 */
export function initBroadcaster(clients) {
  wsClients = clients;
  logDebug(`[EventBroadcaster] Initialized with clients Set, current size: ${clients.size}`);
}

/**
 * Register a state-provider function for full-state broadcasts.
 *
 * @param {function(): Promise<Object>} fn - Async function returning full state
 */
export function setStateProvider(fn) {
  stateProvider = fn;
}

/**
 * Broadcast an event to all connected clients.
 *
 * @param {string} eventType - Event type (e.g., 'cue:changed')
 * @param {Object} data - Event data
 */
export function broadcastEvent(eventType, data = {}) {
  logDebug(`[EventBroadcaster] broadcastEvent called: ${eventType}, clients: ${wsClients?.size || 0}`);
  if (!wsClients || wsClients.size === 0) {
    logDebug(`[EventBroadcaster] No clients to broadcast to`);
    return;
  }

  const message = JSON.stringify({
    type: eventType,
    data,
    timestamp: Date.now()
  });

  logDebug(`[EventBroadcaster] Broadcasting ${eventType} to ${wsClients.size} client(s)`);

  for (const client of wsClients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}

/**
 * Broadcast the full application state to all connected clients.
 * Used after mutations that affect multiple parts of the UI.
 *
 * Requires `setStateProvider` to have been called.
 */
export async function broadcastStateUpdate() {
  if (!wsClients || wsClients.size === 0 || !stateProvider) return;

  const state = await stateProvider();
  const message = JSON.stringify({ type: 'state', state });

  for (const client of wsClients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}
