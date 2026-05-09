/**
 * Centralized Logging System
 * Provides debug logging to file with runtime enable/disable
 */

import fs from 'fs';
import path from 'path';
import { ensureDir } from '../../lib/files.js';

// ============================================================================
// Configuration
// ============================================================================

// Defaults: write to <cwd>/logs/server.log. Consumers that want a
// different location can swap via `initLogger({ logDir, logFile })`
// once the parameterized signature lands; for now these are fixed
// per-process. See TODO in `initLogger`.
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = 'server.log';
const LOG_FILE_PREV = 'server.log.1';
const LOG_PATH = path.join(LOGS_DIR, LOG_FILE);
const LOG_PATH_PREV = path.join(LOGS_DIR, LOG_FILE_PREV);

// Log level hierarchy (higher number = more severe)
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// ============================================================================
// State
// ============================================================================

let loggingEnabled = false;
let timingEnabled = false; // Separate flag for timing/latency logs
let logStream = null;

// Module filtering with level support
// enabledModules: Map of module -> minLevel (null = all levels, or 'debug'|'info'|'warn'|'error')
// disabledModules: Map of module -> Set of disabled levels (null = all levels)
let enabledModules = new Map();
let disabledModules = new Map();

// ============================================================================
// Core Logging Functions
// ============================================================================

/**
 * Roll over log files on startup
 * - Delete the previous backup if it exists
 * - Rename the current log to the backup name if it exists
 */
function rollLogs() {
  try {
    // Delete previous backup if it exists
    if (fs.existsSync(LOG_PATH_PREV)) {
      fs.unlinkSync(LOG_PATH_PREV);
    }

    // Roll current log to backup
    if (fs.existsSync(LOG_PATH)) {
      fs.renameSync(LOG_PATH, LOG_PATH_PREV);
    }
  } catch (error) {
    console.error('[Logger] Failed to roll logs:', error.message);
  }
}

/**
 * Initialize logging system
 * Creates logs directory if needed, rolls logs, and enables logging by default
 */
export function initLogger() {
  try {
    ensureDir(LOGS_DIR);

    // Roll logs on startup
    rollLogs();

    // Enable logging by default
    enableLogging();
  } catch (error) {
    console.error('[Logger] Failed to initialize logger:', error.message);
  }
}

/**
 * Enable logging to file
 * @returns {boolean} Success status
 */
export function enableLogging() {
  if (loggingEnabled) {
    return true; // Already enabled
  }

  try {
    ensureDir(LOGS_DIR);

    // Open log file in append mode
    logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

    loggingEnabled = true;

    // Write separator and timestamp
    const timestamp = new Date().toISOString();
    logStream.write(`\n${'='.repeat(80)}\n`);
    logStream.write(`[${timestamp}] Logging enabled\n`);
    logStream.write(`${'='.repeat(80)}\n\n`);

    return true;
  } catch (error) {
    console.error('[Logger] Failed to enable logging:', error.message);
    return false;
  }
}

/**
 * Disable logging to file
 * @returns {boolean} Success status
 */
export function disableLogging() {
  if (!loggingEnabled) {
    return true; // Already disabled
  }

  try {
    if (logStream) {
      const timestamp = new Date().toISOString();
      logStream.write(`\n[${timestamp}] Logging disabled\n\n`);
      logStream.end();
      logStream = null;
    }

    loggingEnabled = false;
    return true;
  } catch (error) {
    console.error('[Logger] Failed to disable logging:', error.message);
    return false;
  }
}

/**
 * Enable timing/latency logging
 * Outputs timing messages to console for performance analysis
 */
export function enableTiming() {
  timingEnabled = true;
  console.log('[Logger] Timing logging enabled');
}

/**
 * Disable timing/latency logging
 */
export function disableTiming() {
  timingEnabled = false;
  console.log('[Logger] Timing logging disabled');
}

/**
 * Check if timing logging is enabled
 * @returns {boolean} Timing status
 */
export function isTimingEnabled() {
  return timingEnabled;
}

/**
 * Check if logging is enabled
 * @returns {boolean} Logging status
 */
export function isLoggingEnabled() {
  return loggingEnabled;
}

// ============================================================================
// Module Filtering with Level Support
// ============================================================================

/**
 * Enable logging for specific modules with optional level filter
 * - If in blacklist mode (whitelist empty), just removes from blacklist
 * - If in whitelist mode, adds to whitelist and removes from blacklist
 * @param {string} module - Module name to enable
 * @param {string|null} level - Minimum level ('debug'|'info'|'warn'|'error') or null for all
 * @param {boolean} createWhitelist - If true, creates whitelist mode even if currently in blacklist mode
 */
export function enableModule(module, level = null, createWhitelist = false) {
  const normalizedModule = module.toLowerCase().trim();
  if (!normalizedModule) return;

  const normalizedLevel = level ? level.toLowerCase() : null;

  // Validate level if provided
  if (normalizedLevel && !(normalizedLevel in LOG_LEVELS)) {
    console.error(`Invalid log level: ${level}. Valid levels: debug, info, warn, error`);
    return;
  }

  const inWhitelistMode = enabledModules.size > 0 || createWhitelist;

  // Remove from blacklist (either completely or the specific level and above)
  if (disabledModules.has(normalizedModule)) {
    const disabledLevels = disabledModules.get(normalizedModule);

    if (disabledLevels === null) {
      // Was fully disabled, now re-enable
      disabledModules.delete(normalizedModule);
    } else if (normalizedLevel) {
      // Remove the specified level and above from disabled set
      const minLevelValue = LOG_LEVELS[normalizedLevel];
      for (const [lvl, val] of Object.entries(LOG_LEVELS)) {
        if (val >= minLevelValue) {
          disabledLevels.delete(lvl);
        }
      }
      // If no levels left disabled, remove from blacklist entirely
      if (disabledLevels.size === 0) {
        disabledModules.delete(normalizedModule);
      }
    } else {
      // No level specified, remove entirely
      disabledModules.delete(normalizedModule);
    }
  }

  // Add to whitelist if we're in whitelist mode
  if (inWhitelistMode) {
    enabledModules.set(normalizedModule, normalizedLevel);
  }
}

/**
 * Enable logging for multiple modules (convenience wrapper)
 * @param {string[]} modules - Array of module names to enable
 * @param {string|null} level - Minimum level for all modules
 * @param {boolean} createWhitelist - If true, creates whitelist mode
 */
export function enableModules(modules, level = null, createWhitelist = false) {
  for (const mod of modules) {
    enableModule(mod, level, createWhitelist);
  }
}

/**
 * Disable logging for a specific module with optional level filter
 * - If level is specified, only that specific level is disabled
 * - If no level, the entire module is disabled
 * @param {string} module - Module name to disable
 * @param {string|null} level - Specific level to disable, or null for all levels
 */
export function disableModule(module, level = null) {
  const normalizedModule = module.toLowerCase().trim();
  if (!normalizedModule) return;

  const normalizedLevel = level ? level.toLowerCase() : null;

  // Validate level if provided
  if (normalizedLevel && !(normalizedLevel in LOG_LEVELS)) {
    console.error(`Invalid log level: ${level}. Valid levels: debug, info, warn, error`);
    return;
  }

  // Remove from whitelist if present
  enabledModules.delete(normalizedModule);

  if (normalizedLevel) {
    // Disable only a specific level
    if (!disabledModules.has(normalizedModule)) {
      disabledModules.set(normalizedModule, new Set());
    }
    const disabledLevels = disabledModules.get(normalizedModule);
    if (disabledLevels !== null) {
      disabledLevels.add(normalizedLevel);
    }
  } else {
    // Disable all levels for this module
    disabledModules.set(normalizedModule, null);
  }
}

/**
 * Disable logging for multiple modules (convenience wrapper)
 * @param {string[]} modules - Array of module names to disable
 * @param {string|null} level - Specific level to disable, or null for all
 */
export function disableModules(modules, level = null) {
  for (const mod of modules) {
    disableModule(mod, level);
  }
}

/**
 * Clear all module filters (log everything)
 */
export function clearModuleFilters() {
  enabledModules.clear();
  disabledModules.clear();
}

/**
 * Get current module filter status
 * @returns {Object} { enabled: Array, disabled: Array, mode: string }
 */
export function getModuleFilterStatus() {
  let mode = 'all'; // No filtering

  if (disabledModules.size > 0 && enabledModules.size === 0) {
    mode = 'blacklist'; // Logging all except disabled
  } else if (enabledModules.size > 0) {
    mode = 'whitelist'; // Only logging enabled modules
  }

  // Format enabled modules with their levels
  const enabled = [];
  for (const [mod, minLevel] of enabledModules.entries()) {
    if (minLevel) {
      enabled.push(`${mod}:${minLevel}+`);
    } else {
      enabled.push(mod);
    }
  }
  enabled.sort();

  // Format disabled modules with their levels
  const disabled = [];
  for (const [mod, levels] of disabledModules.entries()) {
    if (levels === null) {
      disabled.push(mod);
    } else {
      const levelList = Array.from(levels).sort().join(',');
      disabled.push(`${mod}:${levelList}`);
    }
  }
  disabled.sort();

  return { enabled, disabled, mode };
}

/**
 * Check if a module/level combination is enabled for logging
 * @param {string|null} module - Module name (null for untagged messages)
 * @param {string} level - Log level ('debug'|'info'|'warn'|'error')
 * @returns {boolean} True if this module/level should be logged
 */
function isModuleLevelEnabled(module, level) {
  // Treat null/undefined as 'main' module
  const normalizedModule = (module || 'main').toLowerCase();
  const normalizedLevel = level.toLowerCase();
  const levelValue = LOG_LEVELS[normalizedLevel];

  // Check blacklist first
  if (disabledModules.has(normalizedModule)) {
    const disabledLevels = disabledModules.get(normalizedModule);

    if (disabledLevels === null) {
      // Entire module is disabled
      return false;
    }

    if (disabledLevels.has(normalizedLevel)) {
      // This specific level is disabled
      return false;
    }
  }

  // If whitelist is empty, all modules/levels are enabled
  if (enabledModules.size === 0) {
    return true;
  }

  // Check whitelist
  if (!enabledModules.has(normalizedModule)) {
    return false;
  }

  const minLevel = enabledModules.get(normalizedModule);
  if (minLevel === null) {
    // All levels enabled for this module
    return true;
  }

  // Check if level is at or above minimum
  const minLevelValue = LOG_LEVELS[minLevel];
  return levelValue >= minLevelValue;
}

/**
 * Get log file path
 * @returns {string} Path to log file
 */
export function getLogPath() {
  return LOG_PATH;
}

/**
 * Get log file stats
 * @returns {Object} { exists, size, lines, path }
 */
export function getLogStats() {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      return {
        exists: false,
        size: 0,
        lines: 0,
        path: LOG_PATH
      };
    }

    const stats = fs.statSync(LOG_PATH);
    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = content.split('\n').length - 1; // Don't count trailing newline

    return {
      exists: true,
      size: stats.size,
      lines,
      path: LOG_PATH
    };
  } catch (error) {
    return {
      exists: false,
      size: 0,
      lines: 0,
      path: LOG_PATH,
      error: error.message
    };
  }
}

/**
 * Main logging function
 * Writes to log file if logging is enabled
 * @param {string} message - Message to log
 * @param {string} [module] - Optional module name for filtering
 * @param {string} [level] - Log level ('debug'|'info'|'warn'|'error'), defaults to 'info'
 */
export function log(message, module = null, level = 'info') {
  if (!loggingEnabled || !logStream) {
    return; // Drop message
  }

  // Check module/level filter
  if (!isModuleLevelEnabled(module, level)) {
    return; // Filtered out
  }

  try {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
  } catch (_error) {
    // Silently fail - don't spam console
  }
}

/**
 * Log debug message
 * @param {string} message - Debug message to log
 */
export function logDebug(message) {
  // Try to extract module from message format [Module]
  const moduleMatch = message.match(/^\[([^\]]+)\]/);
  const module = moduleMatch ? moduleMatch[1] : null;
  log(`[DEBUG] ${message}`, module, 'debug');
}

/**
 * Log timing/latency message
 * Separate from debug logs for performance analysis
 * Outputs to console when timing is enabled
 * @param {string} message - Timing message to log
 */
export function logTiming(message) {
  if (!timingEnabled) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [TIMING] ${message}`);

  // Also write to log file if logging enabled
  if (loggingEnabled && logStream) {
    try {
      logStream.write(`[${timestamp}] [TIMING] ${message}\n`);
    } catch (_error) {
      // Silently fail
    }
  }
}

/**
 * Log info message
 * @param {string} message - Info message to log
 */
export function logInfo(message) {
  // Try to extract module from message format [Module]
  const moduleMatch = message.match(/^\[([^\]]+)\]/);
  const module = moduleMatch ? moduleMatch[1] : null;
  log(`[INFO] ${message}`, module, 'info');
}

/**
 * Log warning message
 * @param {string} message - Warning message to log
 */
export function logWarn(message) {
  // Try to extract module from message format [Module]
  const moduleMatch = message.match(/^\[([^\]]+)\]/);
  const module = moduleMatch ? moduleMatch[1] : null;
  log(`[WARN] ${message}`, module, 'warn');
}

/**
 * Log error message
 * @param {string} message - Error message to log
 */
export function logErrorMessage(message) {
  // Try to extract module from message format [Module]
  const moduleMatch = message.match(/^\[([^\]]+)\]/);
  const module = moduleMatch ? moduleMatch[1] : null;
  log(`[ERROR] ${message}`, module, 'error');
}

/**
 * Log with category/prefix at specified level
 * @param {string} category - Category prefix (e.g., 'MIDI', 'Route')
 * @param {string} message - Message to log
 * @param {string} [level] - Log level, defaults to 'info'
 */
export function logCategory(category, message, level = 'info') {
  log(`[${category}] ${message}`, category, level);
}

/**
 * Log object as JSON
 * @param {string} label - Label for the object
 * @param {Object} obj - Object to log
 * @param {string} [level] - Log level, defaults to 'debug'
 */
export function logObject(label, obj, level = 'debug') {
  // Try to extract module from label format [Module]
  const moduleMatch = label.match(/^\[([^\]]+)\]/);
  const module = moduleMatch ? moduleMatch[1] : null;

  try {
    const json = JSON.stringify(obj, null, 2);
    log(`${label}:\n${json}`, module, level);
  } catch (error) {
    log(`${label}: [Error serializing object: ${error.message}]`, module, level);
  }
}

/**
 * Read last N lines from log file
 * @param {number} n - Number of lines to read
 * @returns {string[]} Array of lines
 */
export function tailLog(n = 10) {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      return [];
    }

    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter(line => line.length > 0);

    return lines.slice(-n);
  } catch (error) {
    console.error('[Logger] Failed to read log:', error.message);
    return [];
  }
}

/**
 * Read first N lines from log file
 * @param {number} n - Number of lines to read
 * @returns {string[]} Array of lines
 */
export function headLog(n = 10) {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      return [];
    }

    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter(line => line.length > 0);

    return lines.slice(0, n);
  } catch (error) {
    console.error('[Logger] Failed to read log:', error.message);
    return [];
  }
}

/**
 * Clear log file
 * @returns {boolean} Success status
 */
export function clearLog() {
  try {
    // Close stream if open
    if (logStream) {
      logStream.end();
      logStream = null;
    }

    // Delete file
    if (fs.existsSync(LOG_PATH)) {
      fs.unlinkSync(LOG_PATH);
    }

    // Reopen stream if logging was enabled
    if (loggingEnabled) {
      logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] Log cleared and restarted\n\n`);
    }

    return true;
  } catch (error) {
    console.error('[Logger] Failed to clear log:', error.message);
    return false;
  }
}

// ============================================================================
// Cue State Serialization
// ============================================================================

/**
 * Get the full logger state for cue serialization
 * @returns {Object} Logger state that can be serialized to JSON
 */
export function getLoggerState() {
  // Convert Maps to serializable format
  const enabled = {};
  for (const [mod, level] of enabledModules.entries()) {
    enabled[mod] = level; // level is string or null
  }

  const disabled = {};
  for (const [mod, levels] of disabledModules.entries()) {
    if (levels === null) {
      disabled[mod] = null; // All levels disabled
    } else {
      disabled[mod] = Array.from(levels); // Set of specific levels
    }
  }

  return {
    enabled: loggingEnabled,
    enabledModules: enabled,
    disabledModules: disabled
  };
}

/**
 * Restore logger state from cue data
 * @param {Object} state - Logger state from cue file
 */
export function setLoggerState(state) {
  if (!state) return;

  // Clear existing filters
  enabledModules.clear();
  disabledModules.clear();

  // Restore enabled modules
  if (state.enabledModules) {
    for (const [mod, level] of Object.entries(state.enabledModules)) {
      enabledModules.set(mod, level);
    }
  }

  // Restore disabled modules
  if (state.disabledModules) {
    for (const [mod, levels] of Object.entries(state.disabledModules)) {
      if (levels === null) {
        disabledModules.set(mod, null);
      } else {
        disabledModules.set(mod, new Set(levels));
      }
    }
  }

  // Enable/disable logging
  if (state.enabled && !loggingEnabled) {
    enableLogging();
  } else if (!state.enabled && loggingEnabled) {
    disableLogging();
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup function to close log stream on exit
 */
export function cleanupLogger() {
  if (logStream) {
    try {
      const timestamp = new Date().toISOString();
      logStream.write(`\n[${timestamp}] Shutting down\n`);
      logStream.end();
    } catch (_error) {
      // Ignore errors during cleanup
    }
  }
}

// Initialize on import
initLogger();