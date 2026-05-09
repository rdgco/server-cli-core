#!/usr/bin/env node

/**
 * Two-module demo consumer.
 *
 * Minimal-shape illustration of how a project consumes
 * `server-cli-core`. Stand up a tiny CLI server with two modules
 * (`greet` and `count`) and the package handles the rest — module
 * discovery, dispatch, REPL, history, signal handling.
 *
 * Run interactively:
 *   node examples/two-module-demo/index.js
 *
 * Then at the prompt, try:
 *   help
 *   greet world
 *   count
 *   count
 *   count reset
 *   quit
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrap } from 'server-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await bootstrap({
  modulesDir: path.join(__dirname, 'modules'),
  promptText: 'demo> ',
  banner: '\nserver-cli-core two-module demo ready\nType "help" for available commands.\n',
  farewell: 'goodbye.\n'
});
