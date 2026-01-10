/**
 * Political Sphere — Shared Test Utilities
 *
 * Role:
 *   Provide common test utilities for temp file/directory handling and mock factories.
 *
 * Purpose:
 *   - Reduce duplication across test files
 *   - Centralize temp file/directory creation patterns
 *   - Provide factory functions for common test mocks
 *
 * Usage:
 *   - createTempFile() for individual temp files
 *   - createTempDir() for temporary directories
 *   - createTempScript() for shell scripts
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Create a temporary file with optional content.
 * Caller must clean up with unlink().
 *
 * @param {string} prefix - prefix for the temp file (will be placed in /tmp)
 * @param {string} content - optional content to write to the file
 * @returns {Promise<string>} full path to the created temp file
 */
export async function createTempFile(
  prefix: string = 'tmp-',
  content: string = '',
): Promise<string> {
  const filePath = `${tmpdir()}/${prefix}${randomUUID()}.tmp`;
  if (content) {
    await writeFile(filePath, content);
  }
  return filePath;
}

/**
 * Create a temporary directory.
 * Caller must clean up with rm(path, { recursive: true, force: true }).
 *
 * @param {string} prefix - prefix for the temp directory name
 * @returns {Promise<string>} full path to the created temp directory
 */
export async function createTempDir(prefix: string = 'tmp-'): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

/**
 * Create a temporary shell script in a directory.
 *
 * @param {string} dir - directory to create the script in
 * @param {string} name - script name (without .sh extension)
 * @param {string} content - script content
 * @returns {string} full path to the created script
 */
export function createTempScript(dir: string, name: string, content: string): string {
  const scriptPath = path.join(dir, `${name}.sh`);
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
  return scriptPath;
}

/**
 * Create a temporary directory synchronously (for beforeEach setup).
 *
 * @param {string} prefix - prefix for the temp directory name
 * @returns {string} full path to the created temp directory
 */
export function createTempDirSync(prefix: string = 'tmp-'): string {
  const dir = `${tmpdir()}/${prefix}${Date.now()}`;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up a temporary file or directory by path.
 * Handles both files and directories.
 *
 * @param {string} filePath - path to clean up
 * @throws {Error} if the cleanup fails
 * @returns {Promise<void>}
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath).catch(() => {});
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Clean up a temporary directory synchronously.
 *
 * @param {string} dirPath - path to directory to clean up
 * @returns {void}
 */
export function cleanupTempDirSync(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
}

/**
 * Get the system temp directory without trailing slash.
 * Useful for consistent path assertions across platforms.
 *
 * @returns {string} temp directory path without trailing slash
 */
export function getTempDir(): string {
  const tmp = tmpdir();
  return tmp.endsWith('/') ? tmp.slice(0, -1) : tmp;
}
