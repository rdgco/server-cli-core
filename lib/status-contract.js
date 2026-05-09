/**
 * Module Status Contract
 *
 * Shell-bound. Defines the typed shape that every module's
 * `getStatus()` export should return so a generic renderer (and
 * future shell consumers) can drive a uniform "system status"
 * surface without per-module knowledge.
 *
 * The contract is intentionally three layers:
 *
 * - `level` + `summary` — for one-line overview rows
 *   ("ableton: ok (3 backing, 5 live)").
 * - `details` — for `status <module>` deep dives with formatted
 *   lines, icons, dim subtext.
 * - `issues` — surfaced by `status check` and `status fix`
 *   workflows, with optional `fix` strings the auto-fixer can run.
 * - `raw` — escape hatch for consumers that need the full
 *   underlying data (cue manager UI, scripting). The shell
 *   renderer ignores it.
 *
 * Everything except `level` and `summary` is optional, so trivial
 * modules can return a one-liner and complex modules (route, cue,
 * dmx) can supply rich details.
 *
 * @typedef {('ok'|'warning'|'error'|'unknown')} StatusLevel
 * @typedef {('ok'|'warn'|'error'|'info'|'waiting')} StatusIcon
 *
 * @typedef {Object} StatusDetailLine
 * @property {StatusIcon} [icon]
 * @property {string} text                  - Main label
 * @property {string} [detail]              - Dim suffix (e.g., "→ /dev/usb…")
 *
 * @typedef {Object} StatusIssue
 * @property {string} message               - Human-readable issue summary
 * @property {string} [fix]                 - Optional command-line invocation
 *                                            the auto-fixer can run, e.g.
 *                                            "display start leftscreen"
 * @property {string} [detail]              - Optional dim subtext (e.g.,
 *                                            "device not found")
 *
 * @typedef {Object} ModuleStatus
 * @property {StatusLevel} level
 * @property {string} summary
 * @property {StatusDetailLine[]} [details]
 * @property {StatusIssue[]} [issues]
 * @property {*} [raw]
 *
 * @typedef {ModuleStatus | Promise<ModuleStatus>} ModuleStatusResult
 *
 * Modules implementing the contract export:
 *
 *   export function getStatus() { ... returns ModuleStatusResult ... }
 *
 * The function MAY be async. The shell awaits all status calls in
 * parallel.
 */

const VALID_LEVELS = new Set(['ok', 'warning', 'error', 'unknown']);

/**
 * Lightweight runtime check that a value matches the ModuleStatus
 * shape. Used by the renderer to soften module misbehavior into a
 * visible 'unknown' row instead of throwing, and by tests to
 * assert contract compliance.
 *
 * @param {unknown} value
 * @returns {value is ModuleStatus}
 */
export function isModuleStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!VALID_LEVELS.has(value.level)) return false;
  if (typeof value.summary !== 'string') return false;
  if (value.details !== undefined && !Array.isArray(value.details)) return false;
  if (value.issues !== undefined && !Array.isArray(value.issues)) return false;
  return true;
}

/**
 * Build a fallback "unknown" status for a module that either doesn't
 * implement `getStatus()` or whose implementation threw / returned
 * an off-contract shape. Keeps the renderer total instead of
 * partial.
 *
 * @param {string} reason
 * @returns {ModuleStatus}
 */
export function unknownStatus(reason) {
  return { level: 'unknown', summary: reason };
}
