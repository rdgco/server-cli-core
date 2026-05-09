/**
 * `greet` — minimal stateless module.
 *
 * Demonstrates the simplest module shape: metadata + a `handle()`
 * function that processes the command parts. No subcommands, no
 * registry — appropriate when the module's surface is a single
 * action.
 */

export const metadata = {
  name: 'Greet',
  prefix: 'greet',
  description: 'Say hello to someone',
  commands: {
    'greet <name>': 'Print a greeting'
  }
};

export async function handle(parts) {
  const name = parts[0];
  if (!name) {
    console.error('Usage: greet <name>');
    return false;
  }
  console.log(`hello, ${name}`);
  return true;
}
