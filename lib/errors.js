/**
 * Centralized error handling utilities
 */

/**
 * Log error with context
 */
export function logError(context, error, details = {}) {
  console.error(`[${context}] Error:`, error.message);
  if (Object.keys(details).length > 0) {
    console.error('Details:', details);
  }
  if (process.env.DEBUG) {
    console.error('Stack:', error.stack);
  }
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(context, error);
      throw error;
    }
  };
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logError('JSON Parse', error, { input: jsonString?.substring(0, 100) });
    return fallback;
  }
}

/**
 * Safe file operations
 */
export function safeFileRead(fs, filePath, encoding = 'utf8') {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, encoding);
  } catch (error) {
    logError('File Read', error, { path: filePath });
    throw error;
  }
}

export function safeFileWrite(fs, filePath, data) {
  try {
    fs.writeFileSync(filePath, data);
    return true;
  } catch (error) {
    logError('File Write', error, { path: filePath });
    throw error;
  }
}

