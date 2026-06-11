import {
  enableLogging,
  disableLogging,
  isLoggingEnabled,
  enableTiming,
  disableTiming,
  isTimingEnabled,
  getLogStats,
  getLogPath,
  tailLog,
  headLog,
  clearLog,
  enableModule,
  disableModule,
  clearModuleFilters,
  getModuleFilterStatus
} from './logger.js';
import { formatBytes } from '../../lib/format.js';
import { createDispatcher } from '../../lib/command-registry.js';
import { getModules } from '../../lib/module-registry.js';

const VALID_LEVELS = ['debug', 'info', 'warn', 'error'];

const TAIL_HEAD_SUGGESTIONS = ['10', '20', '50', '100', '200', '500'];

// ============================================================================
// Module Metadata
// ============================================================================

export const metadata = {
  name: 'Log',
  prefix: 'log',
  description: 'Debug logging to file with module and level filtering'
};

// ============================================================================
// Completers
// ============================================================================

const completeModuleName = partial => {
  const p = (partial || '').toLowerCase();
  return Object.keys(getModules()).filter(m => m.toLowerCase().startsWith(p));
};

const completeLevel = partial => {
  const p = (partial || '').toLowerCase();
  return VALID_LEVELS.filter(l => l.startsWith(p));
};

const completeLineCount = partial => TAIL_HEAD_SUGGESTIONS.filter(n => n.startsWith(partial || ''));

// ============================================================================
// Command Registry
// ============================================================================

export const commands = {
  enable: {
    usage: 'enable [module] [level]',
    description: 'Enable logging (optionally for a specific module/level)',
    handler: args => enable(args),
    autocomplete: [completeModuleName, completeLevel]
  },
  disable: {
    usage: 'disable [module] [level]',
    description: 'Disable logging (optionally for a specific module/level)',
    handler: args => disable(args),
    autocomplete: [completeModuleName, completeLevel]
  },
  filter: {
    usage: 'filter clear',
    description: 'Clear all module filters (log everything)',
    subcommands: {
      clear: {
        description: 'Remove all module filters, log everything',
        handler: () => filterClear()
      }
    },
    handler: () => {
      console.log('Usage: log filter clear');
      console.log('  clear - Remove all module filters, log everything');
      return false;
    }
  },
  timing: {
    usage: 'timing [off]',
    description: 'Enable timing/latency logging to console (use `timing off` to disable)',
    subcommands: {
      off: {
        description: 'Disable timing logging',
        handler: () => { disableTiming(); return true; }
      }
    },
    handler: () => { enableTiming(); return true; }
  },
  status: {
    description: 'Show logging status and module filters',
    handler: () => status()
  },
  tail: {
    usage: 'tail [n]',
    description: 'Show last N lines (default 10)',
    handler: args => tail(args[0]),
    autocomplete: [completeLineCount]
  },
  head: {
    usage: 'head [n]',
    description: 'Show first N lines (default 10)',
    handler: args => head(args[0]),
    autocomplete: [completeLineCount]
  },
  clear: {
    description: 'Clear log file',
    handler: () => clear()
  },
  path: {
    description: 'Show log file path',
    handler: () => path()
  }
};

const dispatcher = createDispatcher({
  prefix: 'log',
  commands,
  defaultCommand: 'status'
});

export const handle = dispatcher.handle;
export const autocomplete = dispatcher.autocomplete;

// ============================================================================
// Commands
// ============================================================================

/**
 * Enable logging to file
 * @param {string[]} args - Optional: [module] or [module, level]
 * @returns {Promise<boolean>} Success status
 */
export async function enable(args = []) {
  if (!isLoggingEnabled()) {
    const success = enableLogging();
    if (!success) {
      console.log('✗ Failed to enable logging');
      return false;
    }
  }

  if (args.length === 0) {
    console.log('✓ Logging enabled (all modules, all levels)');
    console.log(`  Writing to: ${getLogPath()}`);
    return true;
  }

  const moduleName = args[0].toLowerCase();
  const level = args[1] ? args[1].toLowerCase() : null;

  if (level && !VALID_LEVELS.includes(level)) {
    console.log(`✗ Invalid log level: ${level}`);
    console.log(`  Valid levels: ${VALID_LEVELS.join(', ')}`);
    return false;
  }

  const filterStatus = getModuleFilterStatus();

  const wasJustEnabled = filterStatus.mode === 'all';

  if (wasJustEnabled) {
    enableModule(moduleName, level, true);
    if (level) {
      console.log(`✓ Logging enabled for ${moduleName} at ${level.toUpperCase()} and above`);
    } else {
      console.log(`✓ Logging enabled for ${moduleName} (all levels)`);
    }
  } else if (filterStatus.mode === 'blacklist') {
    enableModule(moduleName, level, false);
    if (level) {
      console.log(`✓ Re-enabled logging for ${moduleName} at ${level.toUpperCase()} and above`);
    } else {
      console.log(`✓ Re-enabled logging for ${moduleName}`);
    }
  } else {
    enableModule(moduleName, level, false);
    if (level) {
      console.log(`✓ Added ${moduleName} at ${level.toUpperCase()}+ to whitelist`);
    } else {
      console.log(`✓ Added ${moduleName} to whitelist`);
    }
  }

  console.log(`  Writing to: ${getLogPath()}`);

  const newFilterStatus = getModuleFilterStatus();
  if (newFilterStatus.enabled.length > 0) {
    console.log(`  Enabled: ${newFilterStatus.enabled.join(', ')}`);
  }
  if (newFilterStatus.disabled.length > 0) {
    console.log(`  Disabled: ${newFilterStatus.disabled.join(', ')}`);
  }

  return true;
}

/**
 * Disable logging to file or specific modules/levels
 * @param {string[]} args - Optional: [module] or [module, level]
 * @returns {Promise<boolean>} Success status
 */
export async function disable(args = []) {
  if (args.length === 0) {
    const success = disableLogging();

    if (success) {
      console.log('✓ Logging disabled');
    } else {
      console.log('✗ Failed to disable logging');
    }

    return success;
  }

  const moduleName = args[0].toLowerCase();
  const level = args[1] ? args[1].toLowerCase() : null;

  if (level && !VALID_LEVELS.includes(level)) {
    console.log(`✗ Invalid log level: ${level}`);
    console.log(`  Valid levels: ${VALID_LEVELS.join(', ')}`);
    return false;
  }

  disableModule(moduleName, level);

  if (level) {
    console.log(`✓ Disabled ${level.toUpperCase()} level for ${moduleName}`);
  } else {
    console.log(`✓ Disabled all logging for ${moduleName}`);
  }

  const filterStatus = getModuleFilterStatus();
  if (filterStatus.enabled.length > 0) {
    console.log(`  Enabled: ${filterStatus.enabled.join(', ')}`);
  }
  if (filterStatus.disabled.length > 0) {
    console.log(`  Disabled: ${filterStatus.disabled.join(', ')}`);
  }

  return true;
}

function filterClear() {
  clearModuleFilters();
  console.log('✓ Module filters cleared (logging all modules)');
  return true;
}

/**
 * Show logging status
 * @returns {Promise<boolean>} Success status
 */
export async function status() {
  const enabled = isLoggingEnabled();
  const timingOn = isTimingEnabled();
  const stats = getLogStats();
  const filterStatus = getModuleFilterStatus();

  console.log('Logging Status:');
  console.log(`  Enabled: ${enabled ? 'Yes' : 'No'}`);
  console.log(`  Timing: ${timingOn ? 'Yes' : 'No'}`);

  if (stats.exists) {
    console.log(`  File: ${stats.path}`);
    console.log(`  Lines: ${stats.lines.toLocaleString()}`);
    console.log(`  Size: ${formatBytes(stats.size)}`);
  } else {
    console.log(`  File: Not created yet`);
    console.log(`  Path: ${stats.path}`);
  }

  console.log('');
  console.log('Module Filtering:');

  if (filterStatus.mode === 'all') {
    console.log('  Mode: All modules (no filter)');
  } else if (filterStatus.mode === 'whitelist') {
    console.log('  Mode: Whitelist (only specified modules)');
    console.log(`  Enabled: ${filterStatus.enabled.join(', ')}`);
    if (filterStatus.disabled.length > 0) {
      console.log(`  Disabled: ${filterStatus.disabled.join(', ')}`);
    }
  } else if (filterStatus.mode === 'blacklist') {
    console.log('  Mode: Blacklist (all except specified)');
    console.log(`  Disabled: ${filterStatus.disabled.join(', ')}`);
  }

  return true;
}

/**
 * Show last N lines of log
 * @param {string} nStr - Number of lines (default 10)
 * @returns {Promise<boolean>} Success status
 */
export async function tail(nStr) {
  const n = parseInt(nStr, 10) || 10;

  if (n < 1 || n > 1000) {
    console.log('Error: Number of lines must be between 1 and 1000');
    return false;
  }

  const lines = tailLog(n);

  if (lines.length === 0) {
    console.log('No log entries found');
    return true;
  }

  console.log(`Last ${lines.length} lines:\n`);
  lines.forEach(line => console.log(line));

  return true;
}

/**
 * Show first N lines of log
 * @param {string} nStr - Number of lines (default 10)
 * @returns {Promise<boolean>} Success status
 */
export async function head(nStr) {
  const n = parseInt(nStr, 10) || 10;

  if (n < 1 || n > 1000) {
    console.log('Error: Number of lines must be between 1 and 1000');
    return false;
  }

  const lines = headLog(n);

  if (lines.length === 0) {
    console.log('No log entries found');
    return true;
  }

  console.log(`First ${lines.length} lines:\n`);
  lines.forEach(line => console.log(line));

  return true;
}

/**
 * Clear log file
 * @returns {Promise<boolean>} Success status
 */
export async function clear() {
  const stats = getLogStats();

  if (!stats.exists) {
    console.log('No log file to clear');
    return true;
  }

  console.log(`Log has ${stats.lines} lines (${formatBytes(stats.size)})`);
  console.log('Clearing log file...');

  const success = clearLog();

  if (success) {
    console.log('✓ Log cleared');
  } else {
    console.log('✗ Failed to clear log');
  }

  return success;
}

/**
 * Show log file path
 * @returns {Promise<boolean>} Success status
 */
export async function path() {
  console.log(`Log file: ${getLogPath()}`);
  return true;
}
