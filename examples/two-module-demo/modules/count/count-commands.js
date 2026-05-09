/**
 * `count` — stateful module with subcommands via `createDispatcher`.
 *
 * Demonstrates the `createDispatcher` pattern: declare a `commands`
 * registry, hand it to the dispatcher, expose `handle` and
 * `autocomplete` derived from it. Internal state survives across
 * invocations because the module is loaded once at startup.
 *
 * Try:
 *   count           → prints 1, then 2, then 3 ... (defaults to `count inc`)
 *   count peek      → prints current counter without incrementing
 *   count reset     → counter back to 0
 */

import { createDispatcher } from 'server-cli-core';

let counter = 0;

export const metadata = {
  name: 'Count',
  prefix: 'count',
  description: 'A counter that increments each time you call it'
};

export const commands = {
  inc: {
    description: 'Increment the counter (default when no subcommand given)',
    handler: () => {
      counter += 1;
      console.log(counter);
      return true;
    }
  },
  reset: {
    description: 'Reset the counter to 0',
    handler: () => {
      counter = 0;
      console.log('counter reset');
      return true;
    }
  },
  peek: {
    description: 'Print the current value without incrementing',
    handler: () => {
      console.log(`counter is ${counter}`);
      return true;
    }
  }
};

const dispatcher = createDispatcher({
  prefix: 'count',
  commands,
  defaultCommand: 'inc'
});

export const handle = dispatcher.handle;
export const autocomplete = dispatcher.autocomplete;
