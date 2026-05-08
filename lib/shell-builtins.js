/**
 * Shell-level built-in commands and shortcuts.
 *
 * Generic CLI behavior owned by the shell, available regardless of
 * which modules a project loads:
 *
 *   - `clear`           — clear the terminal
 *   - `wait <ms>`       — pause N milliseconds (useful in scripts)
 *   - plural rewrite    — `routes` → `route list` when a `route`
 *                         module exists with a `list` command
 *
 * Project-specific shortcuts (route-shorthand parsing,
 * cue-name fallback, etc.) belong in `lib/command-interceptors.js`,
 * NOT here.
 */

/**
 * Try to handle the input as a shell built-in.
 *
 * @param {string[]} parts - Tokenized command parts. parts[0] is
 *   the command name (caller may lowercase first if desired).
 * @returns {Promise<{ handled: true } | null>}
 *   `{ handled: true }` if the input was consumed by a built-in;
 *   `null` if it wasn't a built-in (caller should continue dispatch).
 */
export async function tryShellBuiltin(parts) {
  if (!parts || parts.length === 0) return null;
  const cmd = parts[0];

  if (cmd === 'clear') {
    console.clear();
    return { handled: true };
  }

  if (cmd === 'wait') {
    const ms = parseInt(parts[1], 10);
    if (isNaN(ms) || ms < 0) {
      console.error('Usage: wait <milliseconds>');
      console.error('Example: wait 1000  (waits 1 second)');
      return { handled: true };
    }
    console.log(`⏳ Waiting ${ms}ms...`);
    await new Promise(resolve => setTimeout(resolve, ms));
    console.log('✓ Done');
    return { handled: true };
  }

  return null;
}

/**
 * If `parts[0]` is a plural form of a known module that has a
 * `list` command, rewrite to `<singular> list ...`. Otherwise
 * returns the original parts unchanged.
 *
 * Examples (assuming a `route` module with `list`):
 *   ['routes']             → ['route', 'list']
 *   ['routes', 'someName'] → ['route', 'list', 'someName']
 *   ['route', 'add', '...'] → unchanged (already known module)
 *   ['apples']             → unchanged (no `apple` module)
 *
 * @param {string[]} parts
 * @param {Object} modules - Map of moduleName → loaded module exports
 * @returns {string[]}
 */
export function applyPluralRewrite(parts, modules) {
  if (!parts || parts.length === 0) return parts;
  const first = parts[0];
  if (modules?.[first]) return parts; // already a known module
  if (!first.endsWith('s')) return parts;

  const singular = first.slice(0, -1);
  const module = modules?.[singular];
  if (!module || !moduleHasListCommand(module)) return parts;

  return [singular, 'list', ...parts.slice(1)];
}

/**
 * Does a module expose a `list` command?
 *
 * Bridges two registry shapes seen in the codebase:
 *   - new shape: `module.commands.list` (registry consumed by createDispatcher)
 *   - old shape: `module.metadata.commands.list` (string-keyed help map)
 *
 * Used to gate plural-name shortcuts (`routes` → `route list`).
 *
 * @param {Object} module - A loaded module's exports
 * @returns {boolean}
 */
export function moduleHasListCommand(module) {
  if (!module) return false;
  if (module.commands && typeof module.commands === 'object' && 'list' in module.commands) {
    return true;
  }
  return Boolean(
    module.metadata?.commands && Object.keys(module.metadata.commands).includes('list')
  );
}
