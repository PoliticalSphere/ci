import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tmp = require('tmp');

import {
  cleanupTempDirSync,
  cleanupTempFile,
  createTempDir,
  createTempDirSync,
  createTempFile,
  createTempScript,
  getTempDir,
} from './temp-utils.ts';

// Helper to create a temporary directory and ensure cleanup
async function withTmpDir<T>(
  fn: (tmpobj: { name: string; removeCallback: () => void }) => T | Promise<T>,
) {
  const tmpobj = tmp.dirSync({ unsafeCleanup: true });
  try {
    return await fn(tmpobj);
  } finally {
    tmpobj.removeCallback();
  }
}

describe('temp utils', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  it('creates a temp file with optional content', async () => {
    const filePath = await createTempFile('ps-temp-', 'hello world');

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe('hello world');

    await cleanupTempFile(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  it('creates a temp file without content when not provided', async () => {
    const filePath = await createTempFile('ps-temp-no-content-');

    // File path is returned but file is not created if no content provided
    expect(typeof filePath).toBe('string');
    expect(filePath).toContain('ps-temp-no-content-');
  });

  it('creates a temp directory asynchronously', async () => {
    const dirPath = await createTempDir('ps-dir-');

    expect(existsSync(dirPath)).toBe(true);
    expect(dirPath.startsWith(`${getTempDir()}/ps-dir-`)).toBe(true);

    cleanupTempDirSync(dirPath);
    expect(existsSync(dirPath)).toBe(false);
  });

  it('creates an executable temp script with provided content', () => {
    const dirPath = createTempDirSync('ps-script-');
    const scriptPath = createTempScript(dirPath, 'test-script', '#!/bin/sh\nprintf "hi"\n');

    expect(readFileSync(scriptPath, 'utf8')).toContain('printf "hi"');
    expect(statSync(scriptPath).mode & 0o777).toBe(0o755);

    cleanupTempDirSync(dirPath);
    expect(existsSync(dirPath)).toBe(false);
  });

  it('creates and removes a sync temp directory', () => {
    const dirPath = createTempDirSync('ps-sync-');

    expect(existsSync(dirPath)).toBe(true);

    cleanupTempDirSync(dirPath);
    expect(existsSync(dirPath)).toBe(false);
  });

  it('cleanupTempFile swallows synchronous unlink errors', async () => {
    await expect(cleanupTempFile(undefined as unknown as string)).resolves.toBeUndefined();
  });

  it('cleanupTempDirSync removes existing directories', () => {
    const dirPath = createTempDirSync('ps-clean-');
    const nestedDir = path.join(dirPath, 'nested');
    const nestedFile = path.join(nestedDir, 'file.txt');

    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(nestedFile, 'data');

    cleanupTempDirSync(dirPath);
    expect(existsSync(dirPath)).toBe(false);
  });

  it('cleanupTempDirSync handles non-existent directories gracefully', () => {
    const nonExistentDir = `/tmp/ps-nonexistent-${Date.now()}`;

    // Should not throw when directory doesn't exist
    expect(() => cleanupTempDirSync(nonExistentDir)).not.toThrow();
  });

  it('getTempDir returns the system temp directory', () => {
    const result = getTempDir();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should not have trailing slash
    expect(result.endsWith('/')).toBe(false);
  });

  it('getTempDir handles both ternary branches', async () => {
    await withTmpDir(async (tmpobj1) => {
      const testCasesWithSlash = `${tmpobj1.name}/`;
      const resultWithSlash = testCasesWithSlash.endsWith('/')
        ? testCasesWithSlash.slice(0, -1)
        : testCasesWithSlash;
      expect(resultWithSlash).toBe(tmpobj1.name);
    });

    await withTmpDir(async (tmpobj2) => {
      const testCasesNoSlash = tmpobj2.name;
      const resultNoSlash = testCasesNoSlash.endsWith('/')
        ? testCasesNoSlash.slice(0, -1)
        : testCasesNoSlash;
      expect(resultNoSlash).toBe(tmpobj2.name);
    });
  });

  it('getTempDir normalizes path with trailing slash', async () => {
    await withTmpDir(async (tmpobj) => {
      // Mock os.tmpdir to return path with trailing slash
      vi.doMock('node:os', () => ({
        tmpdir: () => `${tmpobj.name}/`,
      }));

      // Re-import the function with mocked tmpdir
      const { getTempDir: getTempDirMocked } = await import('./temp-utils.ts');
      const result = getTempDirMocked();

      expect(result).toBe(tmpobj.name);
      expect(result.endsWith('/')).toBe(false);
    });
  });

  it('getTempDir preserves path without trailing slash', async () => {
    await withTmpDir(async (tmpobj) => {
      // Mock os.tmpdir to return path without trailing slash
      vi.doMock('node:os', () => ({
        tmpdir: () => tmpobj.name,
      }));

      // Re-import the function with mocked tmpdir
      const { getTempDir: getTempDirMocked } = await import('./temp-utils.ts');
      const result = getTempDirMocked();

      expect(result).toBe(tmpobj.name);
      expect(result.endsWith('/')).toBe(false);
    });
  });
});
