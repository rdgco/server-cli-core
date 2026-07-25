/**
 * Split a command line into argument tokens.
 *
 * The shell used to split on a bare space, so any argument containing
 * one was silently truncated at the first space and the remainder
 * became extra positional arguments. A command like:
 *
 *   thing create dev --name "Laptop only"
 *
 * arrived as `['create', 'dev', '--name', '"Laptop', 'only"']`, and a
 * handler reading the value after `--name` stored the literal string
 * `"Laptop`. Nothing errored — the corruption only surfaced later, in
 * whatever the value was persisted to.
 *
 * Quoting rules, chosen to match what a POSIX shell user expects
 * without importing shell semantics wholesale:
 *
 *   - Single and double quotes both group, and are stripped from the
 *     result.
 *   - A backslash escapes the next character inside double quotes and
 *     outside quotes. Inside single quotes it is literal, as in sh —
 *     which is what makes single quotes the safe way to pass a Windows
 *     path or a regex.
 *   - An unterminated quote closes at end of line rather than throwing.
 *     This is an interactive prompt: the operator gets the argument
 *     they visibly typed instead of an error about a character they
 *     probably can't see.
 *   - Quoting is positional, not a wrapper: `--name="two words"` and
 *     `two" "words` both yield a single token, as in sh.
 *
 * An empty quoted string (`''`) is a real, preserved token — some
 * commands legitimately take one to mean "clear this value".
 */

const QUOTES = new Set(['"', '\'']);

/**
 * @param {string} line - raw input line
 * @returns {string[]} argument tokens, quotes resolved and stripped
 */
export function tokenize(line) {
  if (typeof line !== 'string') return [];

  const tokens = [];
  let current = '';
  // Tracks whether `current` exists at all, so `''` survives as a token
  // while ordinary runs of whitespace don't produce empty ones.
  let started = false;
  let quote = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '\\' && quote !== '\'' && i + 1 < line.length) {
      current += line[++i];
      started = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (QUOTES.has(ch)) {
      quote = ch;
      started = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }

    current += ch;
    started = true;
  }

  if (started) tokens.push(current);
  return tokens;
}
