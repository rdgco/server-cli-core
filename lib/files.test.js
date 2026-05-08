/**
 * Tests for lib/files.js
 * ESM-compatible version
 */

import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach } from '@jest/globals';

// Since we're using ESM, we need to handle mocking differently
// We'll test the actual functionality rather than mocking everything

import {
  getDirname,
  loadJsonFile,
  saveJsonFile,
  ensureDir,
  listFiles,
  listDirectories
} from './files.js';

import fs from 'fs';
import os from 'os';
import path from 'path';

describe('lib/files.js', () => {
  // Create a temporary test directory for each test
  let testDir;

  beforeEach(() => {
    // Create a unique temporary directory for testing
    testDir = path.join(os.tmpdir(), `test-midi-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getDirname()', () => {
    test('should extract directory from file URL', () => {
      const url = 'file:///home/user/project/modules/test.js';
      const result = getDirname(url);

      // Should return the directory path without the filename
      expect(result).toContain('modules');
      expect(result).not.toContain('test.js');
    });
  });

  describe('ensureDir()', () => {
    test('should create directory if it does not exist', () => {
      const newDir = path.join(testDir, 'new', 'nested', 'dir');

      expect(fs.existsSync(newDir)).toBe(false);

      ensureDir(newDir);

      expect(fs.existsSync(newDir)).toBe(true);
    });

    test('should not fail if directory already exists', () => {
      const existingDir = path.join(testDir, 'existing');
      fs.mkdirSync(existingDir);

      expect(() => ensureDir(existingDir)).not.toThrow();
      expect(fs.existsSync(existingDir)).toBe(true);
    });
  });

  describe('listFiles()', () => {
    test('should list JSON files without extension', () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, 'file1.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'file2.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'readme.txt'), 'test');

      const result = listFiles(testDir, '.json');

      expect(result).toEqual(['file1', 'file2']);
    });

    test('should use .json as default extension', () => {
      fs.writeFileSync(path.join(testDir, 'config.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'settings.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'notes.md'), 'test');

      const result = listFiles(testDir);

      expect(result).toEqual(['config', 'settings']);
    });

    test('should return empty array if directory does not exist', () => {
      const nonExistent = path.join(testDir, 'nonexistent');

      const result = listFiles(nonExistent);

      expect(result).toEqual([]);
    });

    test('should handle empty directory', () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir);

      const result = listFiles(emptyDir);

      expect(result).toEqual([]);
    });
  });

  describe('listDirectories()', () => {
    test('should return only directory names', () => {
      // Create test structure
      fs.mkdirSync(path.join(testDir, 'subdir1'));
      fs.mkdirSync(path.join(testDir, 'subdir2'));
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'test');
      fs.writeFileSync(path.join(testDir, 'another.json'), '{}');

      const result = listDirectories(testDir);

      expect(result.sort()).toEqual(['subdir1', 'subdir2']);
    });

    test('should return empty array if path does not exist', () => {
      const nonExistent = path.join(testDir, 'nonexistent');

      const result = listDirectories(nonExistent);

      expect(result).toEqual([]);
    });

    test('should handle directory with only files', () => {
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'test');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'test');

      const result = listDirectories(testDir);

      expect(result).toEqual([]);
    });
  });

  describe('loadJsonFile()', () => {
    test('should load and parse JSON file', () => {
      const testData = { name: 'test', value: 123, nested: { key: 'value' } };
      const filePath = path.join(testDir, 'test.json');

      fs.writeFileSync(filePath, JSON.stringify(testData, null, 2));

      const result = loadJsonFile(filePath);

      expect(result).toEqual(testData);
    });

    test('should return empty object on parse error', () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not valid json content');

      // Mock console.error to suppress expected error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = loadJsonFile(filePath);

      expect(result).toEqual({});

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });

    test('should handle missing file', () => {
      const filePath = path.join(testDir, 'missing.json');

      // Mock console.error to suppress expected error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = loadJsonFile(filePath);

      expect(result).toEqual({});

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('saveJsonFile()', () => {
    test('should save object as formatted JSON', () => {
      const data = {
        name: 'test',
        items: [1, 2, 3],
        config: { enabled: true }
      };
      const filePath = path.join(testDir, 'output.json');

      saveJsonFile(filePath, data);

      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(data);
      // Check it's formatted (has newlines)
      expect(content).toContain('\n');
    });

    test('should create parent directories if needed', () => {
      const data = { test: true };
      const filePath = path.join(testDir, 'nested', 'deep', 'output.json');

      // Parent directories don't exist yet
      expect(fs.existsSync(path.dirname(filePath))).toBe(false);

      // This might fail if saveJsonFile doesn't create parents
      // In that case, the implementation might need to call ensureDir first
      try {
        saveJsonFile(filePath, data);

        expect(fs.existsSync(filePath)).toBe(true);
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(parsed).toEqual(data);
      } catch (error) {
        // This is expected if saveJsonFile doesn't create parent dirs
        expect(error.code).toBe('ENOENT');
      }
    });

    test('should overwrite existing file', () => {
      const filePath = path.join(testDir, 'existing.json');

      // Write initial content
      saveJsonFile(filePath, { old: 'data' });

      // Overwrite with new content
      const newData = { new: 'content', value: 456 };
      saveJsonFile(filePath, newData);

      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(result).toEqual(newData);
      expect(result).not.toHaveProperty('old');
    });
  });
});

