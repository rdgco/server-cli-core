/** Async readline-based prompts: yes/no, text, question, and choose. */

import readlineSync from 'readline-sync';

/**
 * Ask for yes/no confirmation
 * Accepts: y, yes, Y, YES (case insensitive) for confirmation
 * Anything else (including n, no, empty) is treated as no
 *
 * @param {string} message - Question to ask the user
 * @param {boolean} defaultValue - Default value if user just presses enter (default: false)
 * @returns {Promise<boolean>} True if confirmed (yes), false if declined (no)
 */
export async function confirmYesNo(message, defaultValue = false) {
  // Temporarily switch stdin to raw mode to capture visible input
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  const suffix = defaultValue ? '[Y/n]' : '[y/N]';

  console.log(message);
  const answer = readlineSync.question(`${suffix} > `, {
    hideEchoBack: false
  });

  // Restore raw mode state
  if (process.stdin.isTTY && wasRaw !== undefined) {
    process.stdin.setRawMode(wasRaw);
  }

  // Force stdin to be ready for the async readline interface
  process.stdin.pause();
  process.stdin.resume();

  const trimmed = answer.trim().toLowerCase();

  if (trimmed === '') {
    return defaultValue;
  }

  if (trimmed === 'y' || trimmed === 'yes') {
    return true;
  }

  return false;
}

/**
 * Ask for confirmation by requiring exact text match
 * Useful for destructive operations where you want the user to type something specific
 *
 * @param {string} message - Message to display
 * @param {string} confirmText - Exact text user must type to confirm
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export async function confirmWithText(message, confirmText) {
  // Temporarily switch stdin to raw mode to capture visible input
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  console.log(message);
  console.log(`Type "${confirmText}" to confirm:`);
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
    return false;
  }
}

/**
 * Simple question prompt
 * Asks a question and returns the user's answer
 *
 * @param {string} message - Question to ask
 * @param {string} defaultValue - Default value if user just presses enter
 * @returns {Promise<string>} User's answer (or default if empty)
 */
export async function question(message, defaultValue = '') {
  // Temporarily switch stdin to raw mode to capture visible input
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  console.log(message);
  const prompt = defaultValue ? `[${defaultValue}] > ` : '> ';
  const answer = readlineSync.question(prompt, {
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

  return trimmed || defaultValue;
}

/**
 * Choose from a list of options
 *
 * @param {string} message - Question to ask
 * @param {string[]} options - Array of options to choose from
 * @param {number} defaultIndex - Default option index (0-based)
 * @returns {Promise<number>} Index of selected option
 */
export async function choose(message, options, defaultIndex = 0) {
  // Temporarily switch stdin to raw mode to capture visible input
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  console.log(message);
  options.forEach((option, index) => {
    const isDefault = index === defaultIndex ? ' (default)' : '';
    console.log(`  ${index + 1}. ${option}${isDefault}`);
  });

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

  if (trimmed === '') {
    return defaultIndex;
  }

  const selected = parseInt(trimmed, 10) - 1;

  if (selected >= 0 && selected < options.length) {
    return selected;
  }

  return defaultIndex;
}
