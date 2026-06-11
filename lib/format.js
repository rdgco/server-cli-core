/** Formatting helpers for bytes, durations, numbers, padding, and truncation. */

/**
 * Format bytes as human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds as human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted string (e.g., "2m 30s")
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Format a number with thousands separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number (e.g., "1,234,567")
 */
export function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Pad a string to a fixed width
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {string} [align='left'] - Alignment: 'left', 'right', or 'center'
 * @returns {string} Padded string
 */
export function padString(str, width, align = 'left') {
  const strLen = str.length;

  if (strLen >= width) return str;

  const padding = width - strLen;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
    default:
      return str + ' '.repeat(padding);
  }
}

/**
 * Truncate a string with ellipsis if too long
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
