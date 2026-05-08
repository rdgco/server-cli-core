/**
 * Command Registry
 *
 * Shared dispatcher used by command modules to declare commands, sub-commands,
 * help text, and autocomplete in a single registry. Replaces the per-module
 * triplet of metadata.commands + handle() switch + standalone autocomplete().
 *
 * Usage:
 *
 *   import { createDispatcher } from 'server-cli-core';
 *
 *   export const commands = {
 *     list: {
 *       description: 'List items',
 *       handler: () => list(),
 *     },
 *     add: {
 *       usage: 'add <name>',
 *       description: 'Add an item',
 *       handler: (args) => add(args[0]),
 *       autocomplete: [(partial) => completeName(partial)],
 *     },
 *     config: {
 *       description: 'Configure',
 *       subcommands: {
 *         save: { description: 'Save config', handler: (args) => save(args[0]) },
 *       },
 *       // Optional fall-through handler when no subcommand matches:
 *       handler: (args) => setConfigValue(args[0], args[1]),
 *     },
 *   };
 *
 *   const dispatcher = createDispatcher({
 *     prefix: 'mymod',
 *     commands,
 *     defaultCommand: 'list',
 *   });
 *
 *   export const handle = dispatcher.handle;
 *   export const autocomplete = dispatcher.autocomplete;
 *
 * Registry entry shape:
 *   {
 *     usage:        string  optional — display string; falls back to the key
 *     description:  string  optional — one-line help text
 *     handler:      func    optional — async (args) => boolean | 'exit' | void
 *     autocomplete: array   optional — per-position completers; null = no completion
 *     subcommands:  object  optional — nested registry
 *   }
 *
 * An entry must have at least one of `handler` or `subcommands`.
 *
 * Completer signature:
 *   `(partial, previousArgs) => string[]`
 * where `previousArgs` is the list of already-typed positional arguments
 * before the cursor — useful when completion at position N depends on
 * earlier positions (e.g., the connector at position 2 of `route add` is
 * filtered by the source and destination at positions 0 and 1). Existing
 * completers that take only `partial` keep working unchanged — JavaScript
 * silently ignores the extra argument.
 */

const INFERRED_DEFAULTS = ['list', 'info', 'status'];

/**
 * Create a dispatcher for a command registry.
 *
 * @param {object} config
 * @param {string} config.prefix - CLI prefix (module name), used for help output
 * @param {object} config.commands - The command registry
 * @param {string|null} [config.defaultCommand] - Command to run when args are empty
 * @param {Function|null} [config.fallback] - Called when no command matches.
 *   Signature: `(commandParts) => boolean | 'exit' | void`. Truthy return
 *   indicates "I handled it"; falsy falls through to standard error.
 * @param {Function|null} [config.fallbackAutocomplete] - Called from autocomplete()
 *   when the path doesn't match any registered command, OR additively at position
 *   0 alongside registry-name completion. Signature: `(parts, line) => [completions, line]`.
 *   Same shape as a top-level `module.autocomplete` (parts[0] is the prefix). Use
 *   for modules whose first argument is not always a command name (e.g., a `screen`
 *   module where `screen <name>` selects a screen by name).
 * @returns {{ handle: Function, autocomplete: Function, commands: object }}
 */
export function createDispatcher({
  prefix,
  commands,
  defaultCommand = null,
  fallback = null,
  fallbackAutocomplete = null
}) {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new Error('createDispatcher: prefix must be a non-empty string');
  }
  if (!commands || typeof commands !== 'object') {
    throw new Error('createDispatcher: commands must be an object');
  }
  if (fallbackAutocomplete && typeof fallbackAutocomplete !== 'function') {
    throw new Error('createDispatcher: fallbackAutocomplete must be a function');
  }

  validateRegistry(commands, prefix);

  const resolvedDefault = resolveDefaultCommand(commands, defaultCommand);

  return {
    commands,
    handle: commandParts => dispatch(commandParts || [], commands, prefix, resolvedDefault, fallback),
    autocomplete: (parts, line) => complete(parts || [], line || '', commands, prefix, fallbackAutocomplete)
  };
}

/**
 * Walk a registry recursively and produce a flat list of help entries.
 * Each leaf command (and parent commands that have descriptions) becomes an
 * entry. Used by the help module to render `help <module>` output.
 *
 * @param {object} commands - Registry to walk
 * @param {string} [prefix] - Built-up command prefix (for nested calls)
 * @returns {Array<{ command: string, usage: string, description: string }>}
 */
export function flattenCommands(commands, prefix = '') {
  const result = [];
  for (const key of Object.keys(commands)) {
    const entry = commands[key];
    const fullCommand = prefix ? `${prefix} ${key}` : key;
    const ownUsage = entry.usage || key;
    const fullUsage = prefix ? `${prefix} ${ownUsage}` : ownUsage;

    if (entry.handler || entry.description) {
      result.push({
        command: fullCommand,
        usage: fullUsage,
        description: entry.description || ''
      });
    }

    if (entry.subcommands) {
      result.push(...flattenCommands(entry.subcommands, fullCommand));
    }
  }
  return result;
}

// ============================================================================
// Internals
// ============================================================================

function validateRegistry(commands, contextPath) {
  for (const key of Object.keys(commands)) {
    const entry = commands[key];
    const path = `${contextPath} ${key}`;

    if (!entry || typeof entry !== 'object') {
      throw new Error(`createDispatcher: '${path}' must be an object`);
    }
    if (key.includes(' ')) {
      throw new Error(`createDispatcher: '${path}' command key must not contain spaces`);
    }
    if (!entry.handler && !entry.subcommands) {
      throw new Error(`createDispatcher: '${path}' must define handler or subcommands`);
    }
    if (entry.handler && typeof entry.handler !== 'function') {
      throw new Error(`createDispatcher: '${path}' handler must be a function`);
    }
    if (entry.autocomplete && !Array.isArray(entry.autocomplete)) {
      throw new Error(`createDispatcher: '${path}' autocomplete must be an array of completer functions`);
    }
    if (entry.subcommands) {
      validateRegistry(entry.subcommands, path);
    }
  }
}

function resolveDefaultCommand(commands, declared) {
  if (declared) {
    if (!(declared in commands)) {
      throw new Error(`createDispatcher: defaultCommand '${declared}' is not in the registry`);
    }
    return declared;
  }
  for (const candidate of INFERRED_DEFAULTS) {
    if (candidate in commands) return candidate;
  }
  return null;
}

async function dispatch(commandParts, commands, prefix, defaultCommand, fallback) {
  if (commandParts.length === 0) {
    if (defaultCommand) {
      return runEntry(commands[defaultCommand], [], `${prefix} ${defaultCommand}`);
    }
    printAvailable(commands, prefix);
    return false;
  }

  const command = commandParts[0];
  const args = commandParts.slice(1);

  if (command in commands) {
    return dispatchEntry(commands[command], args, `${prefix} ${command}`);
  }

  if (fallback) {
    const result = await fallback(commandParts);
    if (result) return result;
  }

  console.error(`Unknown ${prefix} command: ${command}`);
  printAvailable(commands, prefix);
  return false;
}

async function dispatchEntry(entry, args, path) {
  if (entry.subcommands && args.length > 0 && args[0] in entry.subcommands) {
    return dispatchEntry(entry.subcommands[args[0]], args.slice(1), `${path} ${args[0]}`);
  }

  if (entry.handler) {
    return entry.handler(args);
  }

  if (entry.subcommands) {
    if (args.length === 0) {
      printAvailable(entry.subcommands, path);
    } else {
      console.error(`Unknown command: ${path} ${args[0]}`);
      printAvailable(entry.subcommands, path);
    }
    return false;
  }

  return false;
}

async function runEntry(entry, args, path) {
  if (entry.handler) return entry.handler(args);
  if (entry.subcommands) {
    printAvailable(entry.subcommands, path);
    return false;
  }
  return false;
}

function printAvailable(commands, prefix) {
  const names = Object.keys(commands);
  if (names.length === 0) return;
  console.log(`Available: ${names.map(n => `${prefix} ${n}`).join(', ')}`);
}

// ----------------------------------------------------------------------------
// Autocomplete
// ----------------------------------------------------------------------------

/**
 * Top-level autocomplete entry point. `parts[0]` is the module prefix.
 *
 * Behavior matches the existing module convention:
 *   - Returns `[completions, line]` where each completion is a full prefixed
 *     command line (so readline can replace the entire line on tab).
 *   - When the cursor is in the command-name position, returns matching
 *     command names.
 *   - When the cursor is past the command name, descends into subcommands
 *     or invokes per-position completers.
 */
function complete(parts, line, commands, prefix, fallbackAutocomplete) {
  // parts[0] should be the prefix; if not, bail
  if (parts.length < 2) {
    return [[], line];
  }

  // parts[1..] is the command path the user is typing
  const commandPath = parts.slice(1);

  // Position 0 of the path: completing the top-level command name.
  // Registry keys come first; fallbackAutocomplete contributions append.
  if (commandPath.length === 1) {
    const partial = commandPath[0];
    const registryMatches = Object.keys(commands)
      .filter(c => c.startsWith(partial))
      .map(c => `${prefix} ${c}`);

    const fallbackMatches = fallbackAutocomplete
      ? (fallbackAutocomplete(parts, line) || [[]])[0] || []
      : [];

    return [[...registryMatches, ...fallbackMatches], line];
  }

  const command = commandPath[0];
  if (!(command in commands)) {
    // Past the first position and the first arg isn't a registry command.
    // The structure beyond this point is module-specific — delegate to the
    // fallback autocomplete if provided.
    if (fallbackAutocomplete) {
      return fallbackAutocomplete(parts, line) || [[], line];
    }
    return [[], line];
  }

  return completeAt(commands[command], commandPath.slice(1), `${prefix} ${command}`, line);
}

function completeAt(entry, remaining, builtPath, line) {
  if (remaining.length === 0) return [[], line];

  // We're at the cursor position when remaining.length === 1.
  if (remaining.length === 1) {
    const partial = remaining[0];
    const matches = [];

    // Subcommand-name completion
    if (entry.subcommands) {
      for (const key of Object.keys(entry.subcommands)) {
        if (key.startsWith(partial)) {
          matches.push(`${builtPath} ${key}`);
        }
      }
    }

    // First-position parameter completer (only when no subcommand consumed it)
    if (entry.autocomplete && entry.autocomplete[0]) {
      const paramMatches = entry.autocomplete[0](partial, []) || [];
      for (const m of paramMatches) {
        matches.push(`${builtPath} ${m}`);
      }
    }

    return [matches, line];
  }

  // remaining.length > 1: descend into subcommand or use position-N completer
  const head = remaining[0];
  const rest = remaining.slice(1);

  if (entry.subcommands && head in entry.subcommands) {
    return completeAt(entry.subcommands[head], rest, `${builtPath} ${head}`, line);
  }

  // Not a subcommand; treat `head` as positional arg #0 already supplied,
  // and the cursor is at position `rest.length - 1` ... wait, simpler:
  // total positional args supplied so far = remaining.length, cursor is at
  // position `remaining.length - 1`.
  const cursorPosition = remaining.length - 1;
  const partial = remaining[cursorPosition];
  const completer = entry.autocomplete && entry.autocomplete[cursorPosition];
  if (!completer) return [[], line];

  const previousArgs = remaining.slice(0, cursorPosition);
  const fixedArgs = previousArgs.join(' ');
  const paramMatches = completer(partial, previousArgs) || [];
  const matches = paramMatches.map(m => `${builtPath} ${fixedArgs} ${m}`.replace(/\s+/g, ' '));
  return [matches, line];
}
