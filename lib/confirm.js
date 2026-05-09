/**
 * Confirmation Prompt Utility
 * Provides reusable confirmation prompts for destructive operations
 */

import readlineSync from 'readline-sync';

/**
 * Ask for confirmation by requiring exact text match
 * @param {string} message - Message to display
 * @param {string} confirmText - Text user must type to confirm
 * @returns {boolean} True if confirmed, false if cancelled
 */
export function confirmWithText(message, confirmText) {
  // Temporarily switch stdin to raw mode to capture visible input
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  console.log(message);
  const answer = readlineSync.question('> ', {
    hideEchoBack: false
  });

  // Restore raw mode state
  if (process.stdin.isTTY && wasRaw !== undefined) {
    process.stdin.setRawMode(wasRaw);
  }

  // Force stdin to be ready for the async readline interface
  process.stdin.pause();
  process.stdin.resume();

  const trimmed = answer.trim();

  if (trimmed === confirmText) {
    return true;
  } else {
    console.log('Action cancelled');
    return false;
  }
}

