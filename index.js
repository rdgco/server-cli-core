/**
 * Top-level barrel — public API for `server-cli-core`.
 *
 * Re-exports the intentionally-public surface of every shell-bound
 * lib/ module. Subpath imports (`server-cli-core/lib/<name>.js`)
 * remain available for consumers that need internal helpers; see
 * `package.json#exports`.
 */

export { bootstrap } from './lib/bootstrap.js';

export { createDispatcher, flattenCommands } from './lib/command-registry.js';

// Command interceptors (pre-dispatch + unknown-command hooks)
export {
  registerPreDispatch,
  registerUnknownCommand,
  runPreDispatch,
  runUnknownCommand,
  getRegistered
} from './lib/command-interceptors.js';

// Shell built-ins (clear, wait, plural-rewrite)
export {
  tryShellBuiltin,
  applyPluralRewrite,
  moduleHasListCommand
} from './lib/shell-builtins.js';

// Shutdown service (LIFO cleanup registry)
export {
  onShutdown,
  runShutdown,
  hasShutdownRun,
  isShuttingDown
} from './lib/shutdown-service.js';

// Status contract (typed module status surface)
export { isModuleStatus, unknownStatus } from './lib/status-contract.js';

// Session state (namespaced JSON KV store)
export {
  configure as configureSessionState,
  get as getSessionState,
  set as setSessionState,
  update as updateSessionState,
  clear as clearSessionState,
  has as hasSessionState,
  destroy as destroySessionState,
  exists as sessionStateExists
} from './lib/session-state.js';
export { default as sessionState } from './lib/session-state.js';

// SQLite connection cache
export { openDatabase, closeDatabase, closeAll } from './lib/sqlite-connection.js';

// Telemetry context (ambient transaction-id primitives)
export {
  TRANSACTION_EXPIRY_MS,
  generateTransactionId,
  getActiveTransactionId,
  getActiveTriggerTimestamp,
  beginTransactionContext,
  endTransactionContext
} from './lib/telemetry-context.js';

// Event broadcaster (generic WebSocket pub/sub)
export {
  initBroadcaster,
  setStateProvider,
  broadcastEvent,
  broadcastStateUpdate
} from './lib/event-broadcaster.js';

export {
  loadHistory,
  saveHistory,
  getHistory,
  addCommand,
  clearHistory,
  getStats as getHistoryStats
} from './lib/history.js';

export {
  getDirname,
  loadJsonFile,
  saveJsonFile,
  ensureDir,
  listFiles,
  listDirectories
} from './lib/files.js';

export {
  formatBytes,
  formatDuration,
  formatNumber,
  padString,
  truncate
} from './lib/format.js';

export {
  logError,
  withErrorHandling,
  safeJsonParse,
  safeFileRead,
  safeFileWrite
} from './lib/errors.js';

// Async readline prompts (yes/no, free text, choose-from-list, type-to-confirm)
export {
  confirmYesNo,
  confirmWithText,
  question,
  choose
} from './lib/prompt.js';

// Synchronous type-to-confirm prompt — distinct from prompt.js's
// async `confirmWithText`; kept reachable via subpath:
//   import { confirmWithText } from 'server-cli-core/lib/confirm.js';

// Module registry — set by the consumer's bootstrap, read by shell
// modules that walk the loaded module map (e.g. help, log autocomplete)
export {
  setModules,
  getModules,
  clearModules
} from './lib/module-registry.js';

// Logger — file-backed, module/level-filtering aware
export {
  log,
  logDebug,
  logInfo,
  logWarn,
  logErrorMessage,
  logTiming,
  logCategory,
  logObject,
  initLogger,
  enableLogging,
  disableLogging,
  isLoggingEnabled,
  enableTiming,
  disableTiming,
  isTimingEnabled,
  enableModule,
  enableModules,
  disableModule,
  disableModules,
  clearModuleFilters,
  getModuleFilterStatus,
  getLogPath,
  getLogStats,
  tailLog,
  headLog,
  clearLog,
  getLoggerState,
  setLoggerState,
  cleanupLogger
} from './modules/log/logger.js';
