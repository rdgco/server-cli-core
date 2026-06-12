/**
 * Tests for lib/format.js — formatting helpers.
 */

import { describe, test, expect } from '@jest/globals';

import {
  formatBytes,
  formatDuration,
  formatNumber,
  padString,
  truncate
} from './format.js';

describe('lib/format.js', () => {
  describe('formatBytes()', () => {
    test('returns "0 B" for zero', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    test('formats bytes under 1 KB', () => {
      expect(formatBytes(512)).toBe('512 B');
    });

    test('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    test('formats megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    test('formats gigabytes and terabytes', () => {
      expect(formatBytes(1024 ** 3)).toBe('1 GB');
      expect(formatBytes(1024 ** 4)).toBe('1 TB');
    });

    test('rounds to two decimal places', () => {
      expect(formatBytes(1234)).toBe('1.21 KB');
    });
  });

  describe('formatDuration()', () => {
    test('formats sub-second durations as milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    test('formats whole seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(45000)).toBe('45s');
    });

    test('formats minutes and remaining seconds', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(150000)).toBe('2m 30s');
    });

    test('formats hours and remaining minutes', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(3600000 + 30 * 60000)).toBe('1h 30m');
    });
  });

  describe('formatNumber()', () => {
    test('adds thousands separators', () => {
      expect(formatNumber(1234567)).toBe((1234567).toLocaleString());
    });

    test('leaves small numbers unchanged', () => {
      expect(formatNumber(42)).toBe('42');
    });
  });

  describe('padString()', () => {
    test('left-aligns by default', () => {
      expect(padString('hi', 5)).toBe('hi   ');
    });

    test('right-aligns', () => {
      expect(padString('hi', 5, 'right')).toBe('   hi');
    });

    test('center-aligns with extra padding on the right', () => {
      expect(padString('hi', 5, 'center')).toBe(' hi  ');
    });

    test('returns the string unchanged when it meets or exceeds width', () => {
      expect(padString('hello', 5)).toBe('hello');
      expect(padString('hello world', 5)).toBe('hello world');
    });
  });

  describe('truncate()', () => {
    test('leaves short strings unchanged', () => {
      expect(truncate('hello', 10)).toBe('hello');
      expect(truncate('hello', 5)).toBe('hello');
    });

    test('truncates with ellipsis when too long', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
      expect(truncate('hello world', 8).length).toBe(8);
    });
  });
});
