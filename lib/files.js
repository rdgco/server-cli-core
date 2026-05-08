/**
 * File system utilities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeFileRead, safeFileWrite, safeJsonParse, logError } from './errors.js';

/**
 * Get __dirname equivalent for ES modules
 */
export function getDirname(importMetaUrl) {
  const __filename = fileURLToPath(importMetaUrl);
  return path.dirname(__filename);
}

/**
 * Load and parse JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {Object} Parsed JSON object
 */
export function loadJsonFile(filePath) {
  try {
    const content = safeFileRead(fs, filePath);
    return safeJsonParse(content, {});
  } catch (_err) {
    // safeFileRead already logged via logError. Match the docstring and
    // the parse-failure path: missing/unreadable files return an empty
    // object so callers can treat both error modes uniformly.
    return {};
  }
}

/**
 * Save JSON to file
 * @param {string} filePath - Path to save to
 * @param {Object} data - Data to save
 */
export function saveJsonFile(filePath, data) {
  const jsonString = JSON.stringify(data, null, 2);
  safeFileWrite(fs, filePath, jsonString);
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * List files in directory with extension filter
 * @param {string} dirPath - Directory path
 * @param {string} extension - File extension (e.g., '.json')
 * @returns {string[]} Array of filenames without extension
 */
export function listFiles(dirPath, extension = '.json') {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith(extension))
      .map(f => f.replace(extension, ''));
  } catch (error) {
    logError('List Files', error, { path: dirPath });
    return [];
  }
}

/**
 * List directories in a path
 * @param {string} dirPath - Directory path
 * @returns {string[]} Array of directory names
 */
export function listDirectories(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (error) {
    logError('List Directories', error, { path: dirPath });
    return [];
  }
}

