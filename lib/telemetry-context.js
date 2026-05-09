/**
 * Telemetry Context (generic primitives)
 *
 * Generic in-memory ambient transaction context for any modular CLI
 * server that wants to instrument timed operations without threading
 * a transaction ID through every function signature.
 *
 * The pattern:
 *   1. Caller starts a transaction:
 *        const id = generateTransactionId();
 *        beginTransactionContext(id, Date.now());
 *
 *   2. Downstream code (deep call stack, async work, completed
 *      WebSocket round-trips) reads the active context:
 *        const id = getActiveTransactionId();
 *        const startedAt = getActiveTriggerTimestamp();
 *
 *   3. When the transaction ends, caller clears the context:
 *        endTransactionContext();
 *
 *   4. If the caller forgets to end (crash, bug, lost message), the
 *      auto-expiry timer (TRANSACTION_EXPIRY_MS) clears the context
 *      so it doesn't leak into the next transaction.
 *
 * This file holds *only* the in-memory tracking + ID generation +
 * expiry timer. It does not know about storage, schemas, telemetry
 * databases, or any specific event types. Consumers wrap these
 * primitives with their own recording / persistence layer.
 */

let _activeTransactionId = null;
let _activeTriggerTimestamp = null;
let _expiryTimer = null;

/**
 * How long an active transaction context can survive without an
 * explicit `endTransactionContext()` call before it auto-clears.
 *
 * 30 seconds is generous for short interactive transactions (most
 * finish in <1s) but short enough that a stuck context doesn't leak
 * across user actions. If a consumer genuinely needs longer
 * transactions, this constant should be re-evaluated.
 */
export const TRANSACTION_EXPIRY_MS = 30000;

/**
 * Generate a unique transaction ID.
 *
 * Format: `<timestamp>-<random4>` (e.g., "1715000000000-a7f3").
 * Sortable by start time. Collisions are vanishingly unlikely in
 * single-process use; not designed for distributed coordination.
 *
 * @returns {string}
 */
export function generateTransactionId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 6);
  return `${ts}-${rand}`;
}

/**
 * Get the currently active transaction ID, or null if none.
 * @returns {string|null}
 */
export function getActiveTransactionId() {
  return _activeTransactionId;
}

/**
 * Get the trigger timestamp of the active transaction (the value
 * passed to `beginTransactionContext`), or null if none.
 * Useful for computing end-to-end durations without re-querying
 * persisted storage.
 * @returns {number|null}
 */
export function getActiveTriggerTimestamp() {
  return _activeTriggerTimestamp;
}

/**
 * Set the active transaction context. The expiry timer auto-clears
 * the context after `TRANSACTION_EXPIRY_MS` if `endTransactionContext`
 * isn't called first.
 *
 * If a previous transaction is still active, it's overwritten
 * silently (callers are responsible for ordering).
 *
 * @param {string} transactionId - The new active transaction ID
 * @param {number} [triggerTimestamp] - When the transaction started.
 *   Defaults to `Date.now()`.
 */
export function beginTransactionContext(transactionId, triggerTimestamp = Date.now()) {
  _activeTransactionId = transactionId;
  _activeTriggerTimestamp = triggerTimestamp;

  if (_expiryTimer) clearTimeout(_expiryTimer);
  _expiryTimer = setTimeout(() => {
    if (_activeTransactionId === transactionId) {
      _activeTransactionId = null;
      _activeTriggerTimestamp = null;
    }
  }, TRANSACTION_EXPIRY_MS);
}

/**
 * Clear the active transaction context. Symmetric with
 * `beginTransactionContext`. Cancels the expiry timer.
 */
export function endTransactionContext() {
  if (_expiryTimer) {
    clearTimeout(_expiryTimer);
    _expiryTimer = null;
  }
  _activeTransactionId = null;
  _activeTriggerTimestamp = null;
}
