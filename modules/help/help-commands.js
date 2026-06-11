import { getModules } from '../../lib/module-registry.js';
import { flattenCommands } from '../../lib/command-registry.js';

// ============================================================================
// Module Metadata
// ============================================================================

export const metadata = {
  name: 'Help',
  prefix: 'help',
  description: 'Display help information',
  commands: {
    help: 'Show module summary',
    'help <module>': 'Show detailed help for module'
  }
};

// ============================================================================
// Autocomplete Implementation
// ============================================================================

/**
 * Autocomplete function for help module
 * @param {string[]} parts - Array of words in the command line
 * @param {string} line - The complete line being typed
 * @returns {[string[], string]} Tuple of [completions, line]
 */
export function autocomplete(parts, line) {
  if (parts.length === 2) {
    const modules = getModules();
    const moduleNames = Object.keys(modules);
    const hits = moduleNames.filter(name => name.startsWith(parts[1]));
    const completions = hits.map(name => `help ${name}`);
    return [completions, line];
  }

  return [[], line];
}

// ============================================================================
// Module Interface
// ============================================================================

/**
 * Handle command for help module
 * @param {string[]} commandParts - Array of command parts
 * @returns {Promise<boolean>} True on success
 */
export async function handle(commandParts) {
  const moduleName = commandParts[0];

  if (!moduleName) {
    return showSummary();
  }

  return showModuleHelp(moduleName);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Show summary of all available modules
 * @returns {boolean} Always true
 */
function showSummary() {
  const modules = getModules();

  console.log('\nBuilt-in commands:\n');
  console.log('  status       - Show comprehensive system status');
  console.log('  clear        - Clear the terminal screen');
  console.log('  wait <ms>    - Wait for specified milliseconds');
  console.log('  quit         - Exit the application');

  console.log('\nAvailable modules:\n');

  const moduleNames = Object.keys(modules).sort((a, b) => a.localeCompare(b));

  moduleNames.forEach(moduleName => {
    const module = modules[moduleName];
    if (module.metadata) {
      const meta = module.metadata;
      const prefix = meta.prefix || moduleName;
      const description = meta.description || 'No description';

      console.log(`  ${prefix.padEnd(12)} - ${description}`);
    }
  });

  console.log('\nFor details, use: help <module>\n');

  return true;
}

/**
 * Show detailed help for a specific module
 * @param {string} moduleName - Name of module to show help for
 * @returns {boolean} True if module found, false otherwise
 */
function showModuleHelp(moduleName) {
  const modules = getModules();

  const moduleKey = Object.keys(modules).find(key => {
    const module = modules[key];
    const prefix = module.metadata?.prefix || key;
    return prefix.toLowerCase() === moduleName.toLowerCase();
  });

  if (!moduleKey) {
    console.log(`Unknown module: ${moduleName}`);
    console.log('Use "help" to see available modules\n');
    return false;
  }

  const module = modules[moduleKey];
  const meta = module.metadata;
  const prefix = meta.prefix || moduleKey;

  console.log(`\n${meta.name} - ${meta.description || 'No description'}\n`);
  console.log('Commands:');

  // New shape: module exports a `commands` registry consumed by createDispatcher.
  // Old shape: module declares commands as `metadata.commands` strings.
  // Both shapes coexist during the dispatch-pattern migration.
  if (module.commands) {
    const flat = flattenCommands(module.commands, prefix);
    flat.forEach(({ usage, description }) => {
      console.log(`  ${usage}`);
      console.log(`    ${description || '(no description)'}`);
      console.log('');
    });
  } else if (meta.commands) {
    Object.entries(meta.commands).forEach(([cmd, desc]) => {
      const fullCmd = `${prefix} ${cmd}`;
      console.log(`  ${fullCmd}`);
      console.log(`    ${desc}`);
      console.log('');
    });
  } else {
    console.log('  (no commands declared)\n');
  }

  return true;
}
