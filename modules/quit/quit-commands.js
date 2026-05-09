/**
 * Quit Commands Module
 * Application exit with optional confirmation.
 *
 * Cleanup logic itself lives in the shell shutdown service
 * (`lib/shutdown-service.js`); this module just owns the user-facing
 * confirm flow and decides when to invoke it. Returning `'exit'`
 * from a handler triggers the shell's `exitApplication()` path.
 */

import readlineSync from 'readline-sync';
import { createDispatcher } from '../../lib/command-registry.js';

// ============================================================================
// Module Metadata
// ============================================================================

export const metadata = {
  name: 'Quit',
  prefix: 'quit',
  description: 'Exit the application'
};

// ============================================================================
// Quit-Confirm Text Providers
// ============================================================================
//
// These are callbacks that contribute "this will be lost / closed" hints
// to the confirm prompt. Module cleanup itself runs through the shell
// shutdown service (`onShutdown(...)`); this hook is only for *describing*
// what's about to happen so the operator can decide whether to confirm.

const quitConfirmTextProviders = [];

/**
 * Register a function that contributes text to the quit confirmation prompt.
 * @param {Function} textProvider - Returns a string or null
 */
export function addQuitConfirmText(textProvider) {
  if (typeof textProvider === 'function') {
    quitConfirmTextProviders.push(textProvider);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Prompt for yes/no confirmation, surfacing any hints from registered
 * text providers along the way.
 * @returns {boolean} True if user confirmed with y/Y
 */
function confirmQuit() {
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  const additionalTexts = [];
  for (const provider of quitConfirmTextProviders) {
    try {
      const text = provider();
      if (text) {
        additionalTexts.push(text);
      }
    } catch (_error) {
      // Silently ignore errors from text providers
    }
  }

  if (additionalTexts.length > 0) {
    console.log('');
    additionalTexts.forEach(text => console.log(text));
    console.log('');
  }

  const answer = readlineSync.question('Are you sure you want to quit? (y/n): ', {
    hideEchoBack: false
  });

  if (process.stdin.isTTY && wasRaw !== undefined) {
    process.stdin.setRawMode(wasRaw);
  }

  // Force stdin to be ready for the async readline interface
  process.stdin.pause();
  process.stdin.resume();

  const trimmed = answer.trim().toLowerCase();
  return trimmed === 'y' || trimmed === 'yes';
}

// ============================================================================
// Public Commands
// ============================================================================

/**
 * Quit the application with confirmation.
 * Returns `'exit'` to signal the shell to invoke its shutdown path
 * (which fans out via the shutdown service to every registered handler).
 *
 * @returns {Promise<string|null>} 'exit' to trigger exit, null if cancelled
 */
export async function quit() {
  const confirmed = confirmQuit();
  if (confirmed) {
    return 'exit';
  }
  console.log('Hey Now, welcome back!');
  return null;
}

/**
 * Force quit without confirmation.
 * @returns {Promise<string>} Always 'exit'
 */
export async function force() {
  return 'exit';
}

// ============================================================================
// Command Registry
// ============================================================================

export const commands = {
  quit: {
    description: 'Exit with confirmation',
    handler: () => quit()
  },
  force: {
    description: 'Exit immediately without confirmation',
    handler: () => force()
  }
};

const dispatcher = createDispatcher({
  prefix: 'quit',
  commands,
  defaultCommand: 'quit'
});

export const handle = dispatcher.handle;
export const autocomplete = dispatcher.autocomplete;
