/** In-process command history with file persistence. */

import fs from 'fs';
import path from 'path';
import os from 'os';

const HISTORY_FILE = path.join(os.homedir(), '.mididaddy_history');
const MAX_HISTORY = 1000;

let historyArray = [];

/**
 * Load command history from file
 * @returns {Array<string>} History array
 */
export function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      historyArray = content
        .split('\n')
        .filter(line => line.trim())
        .slice(-MAX_HISTORY);
      return historyArray;
    }
  } catch (error) {
    console.error('Error loading history:', error.message);
  }
  historyArray = [];
  return historyArray;
}

/**
 * Save command history to file
 * @param {Array<string>} history - Optional history array to save (defaults to internal)
 */
export function saveHistory(history = null) {
  try {
    const toSave = history || historyArray;
    const content = toSave.slice(-MAX_HISTORY).join('\n') + '\n';
    fs.writeFileSync(HISTORY_FILE, content, 'utf-8');
  } catch (error) {
    console.error('Error saving history:', error.message);
  }
}

/**
 * Get current history array
 * @returns {Array<string>} History array
 */
export function getHistory() {
  return historyArray;
}

/**
 * Add command to history
 * @param {string} command - Command to add
 */
export function addCommand(command) {
  if (command && command.trim()) {
    historyArray.push(command.trim());
    if (historyArray.length > MAX_HISTORY) {
      historyArray = historyArray.slice(-MAX_HISTORY);
    }
  }
}

/**
 * Clear all history
 */
export function clearHistory() {
  historyArray = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  } catch (error) {
    console.error('Error clearing history file:', error.message);
  }
}

/**
 * Get history statistics
 * @returns {Object} Stats object
 */
export function getStats() {
  return {
    count: historyArray.length,
    maxSize: MAX_HISTORY,
    file: HISTORY_FILE
  };
}

