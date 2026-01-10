/**
 * Political Sphere — Console Capture Utilities
 *
 * Role:
 *   Capture and verify console output during testing.
 *
 * Responsibilities:
 *   - Mock console methods (log, error, warn, info)
 *   - Capture output for assertions
 *   - Restore original console behavior
 *
 * This file is:
 *   - Test-only infrastructure
 *   - Side-effect managed (captures then restores)
 *   - Deterministic and isolated
 */

interface CapturedOutput {
  logs: string[];
  errors: string[];
  warns: string[];
  infos: string[];
}

const captured: CapturedOutput = {
  logs: [],
  errors: [],
  warns: [],
  infos: [],
};

let originalLog: typeof console.log | null = null;
let originalError: typeof console.error | null = null;
let originalWarn: typeof console.warn | null = null;
let originalInfo: typeof console.info | null = null;

/**
 * Start capturing console output
 * Must call restoreLogs() to clean up
 *
 * @returns {void}
 * @example
 * ```ts
 * captureLogs();
 * console.log('test');
 * expect(getLogs()).toContain('test');
 * restoreLogs();
 * ```
 */
export function captureLogs(): void {
  // Reset captured data
  captured.logs = [];
  captured.errors = [];
  captured.warns = [];
  captured.infos = [];

  // Save originals
  originalLog = console.log;
  originalError = console.error;
  originalWarn = console.warn;
  originalInfo = console.info;

  // Replace with capturing versions
  console.log = (...args: unknown[]) => {
    captured.logs.push(args.map(String).join(' '));
  };

  console.error = (...args: unknown[]) => {
    captured.errors.push(args.map(String).join(' '));
  };

  console.warn = (...args: unknown[]) => {
    captured.warns.push(args.map(String).join(' '));
  };

  console.info = (...args: unknown[]) => {
    captured.infos.push(args.map(String).join(' '));
  };
}

/**
 * Restore original console methods
 * Call after captureLogs()
 *
 * @returns {void}
 */
export function restoreLogs(): void {
  if (originalLog) {
    console.log = originalLog;
  }
  if (originalError) {
    console.error = originalError;
  }
  if (originalWarn) {
    console.warn = originalWarn;
  }
  if (originalInfo) {
    console.info = originalInfo;
  }

  originalLog = null;
  originalError = null;
  originalWarn = null;
  originalInfo = null;
}

/**
 * Get captured logs
 * @returns {string[]} Array of log messages
 */
export function getLogs(): string[] {
  return [...captured.logs];
}

/**
 * Get captured errors
 * @returns {string[]} Array of error messages
 */
export function getErrors(): string[] {
  return [...captured.errors];
}

/**
 * Get captured warnings
 * @returns {string[]} Array of warning messages
 */
export function getWarnings(): string[] {
  return [...captured.warns];
}

/**
 * Get captured info messages
 * @returns {string[]} Array of info messages
 */
export function getInfos(): string[] {
  return [...captured.infos];
}

/**
 * Clear all captured output
 *
 * @returns {void}
 */
export function clearCaptured(): void {
  captured.logs = [];
  captured.errors = [];
  captured.warns = [];
  captured.infos = [];
}
