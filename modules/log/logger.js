/**
 * Logger — temporary console-backed shim.
 *
 * This is a placeholder so `lib/event-broadcaster.js` (and any other
 * lib/ file that imports the logger) can resolve `logDebug` while
 * the real logger module — with module/level filtering, file rotation,
 * timing channels, etc. — has not yet landed.
 *
 * Replaced wholesale when the full log module ships; the export
 * contract here matches the names callers already use, so the swap
 * is a one-file replacement.
 */

export function log(message) {
  console.log(message);
}

export function logDebug(message) {
  if (process.env.DEBUG) console.log(`[debug] ${message}`);
}

export function logInfo(message) {
  console.log(`[info] ${message}`);
}

export function logWarn(message) {
  console.warn(`[warn] ${message}`);
}

export function logErrorMessage(message) {
  console.error(`[error] ${message}`);
}
