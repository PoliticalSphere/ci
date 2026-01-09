/**
 * Political Sphere — CLI Test Fixtures — Tests
 *
 * Role:
 *   Unit tests for the `createMainTestDeps` helpers in
 *   `src/__test-utils__/cli-main-fixtures.ts`.
 *
 * Notes:
 *   - Verifies that mock factories and bundled options behave as expected.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import tmp from 'tmp';
import { describe, expect, it, vi } from 'vitest';

import { createMainTestDeps } from './cli-main-fixtures.ts';

describe('CLI test utils', () => {
  it('creates dependencies without injecting console', async () => {
    const {
      options,
      renderDashboardFn,
      renderWaitingHeaderFn,
      executeLintersFn,
      calculateSummaryFn,
      acquireExecutionLockFn,
    } = createMainTestDeps(['--foo']);

    expect(options.console).toBeUndefined();

    const tmpobj = tmp.fileSync(); // Compliant
    tmpobj.removeCallback(); // Clean up the temp file
    const testTmpDir = `${path.dirname(tmpobj.name)}/test-${Date.now()}`;
    mkdirSync(testTmpDir, { recursive: true });

    try {
      mkdirSync(`${testTmpDir}/logs`, { recursive: true });

      const dashboard = renderDashboardFn();
      dashboard.updateStatus('running');

      const waiting = renderWaitingHeaderFn();
      waiting.unmount();

      const summary = calculateSummaryFn();
      expect(summary.total).toBe(1);

      // acquireExecutionLockFn is async, so we need to handle it
      const lock = await acquireExecutionLockFn();
      expect(lock.lockPath).toBeDefined();

      const testLogDir = `${testTmpDir}/test-logs`;
      mkdirSync(testLogDir, { recursive: true });
      writeFileSync(`${testLogDir}/eslint.log`, 'test');
      const results = await executeLintersFn([], { logDir: testLogDir });
      expect(results[0]?.logPath).toBe(`${testLogDir}/eslint.log`);
    } finally {
      rmSync(testTmpDir, { recursive: true, force: true });
    }
  });

  it('includes injected console and lock helpers', async () => {
    const fakeConsole = { log: vi.fn() };
    const { options, acquireExecutionLockFn } = createMainTestDeps([], fakeConsole);

    expect(options.console).toBe(fakeConsole);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath).toBeDefined();
  });

  it('falls back to temp directory path correctly', async () => {
    const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

    // Verify options.cwd is set
    expect(options.cwd).toBeDefined();
    expect(typeof options.cwd).toBe('string');

    // Verify lock path is set
    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath).toBeDefined();
    expect(typeof lock.lockPath).toBe('string');
  });

  it('handles TMPDIR with trailing slash correctly', async () => {
    const originalTmpDir = process.env.TMPDIR;
    try {
      // Set TMPDIR with trailing slash
      process.env.TMPDIR = '/tmp/test/';
      const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

      // Verify options.cwd doesn't have double slashes
      expect(options.cwd).toBeDefined();
      expect(typeof options.cwd).toBe('string');
      expect(options.cwd).not.toContain('//');

      // Verify lock path doesn't have double slashes
      const lock = await acquireExecutionLockFn();
      expect(lock.lockPath).toBeDefined();
      expect(typeof lock.lockPath).toBe('string');
      expect(lock.lockPath).not.toContain('//');
    } finally {
      // Restore original TMPDIR
      if (originalTmpDir === undefined) {
        process.env.TMPDIR = undefined;
      } else {
        process.env.TMPDIR = originalTmpDir;
      }
    }
  });

  it('handles TMPDIR without trailing slash correctly', async () => {
    const originalTmpDir = process.env.TMPDIR;
    try {
      // Set TMPDIR without trailing slash
      process.env.TMPDIR = '/tmp/test';
      const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

      // Verify options.cwd is set correctly
      expect(options.cwd).toBeDefined();
      expect(typeof options.cwd).toBe('string');
      expect(options.cwd).toContain('/tmp/test/');

      // Verify lock path is set correctly
      const lock = await acquireExecutionLockFn();
      expect(lock.lockPath).toBeDefined();
      expect(typeof lock.lockPath).toBe('string');
      expect(lock.lockPath).toContain('/tmp/test/');
    } finally {
      // Restore original TMPDIR
      if (originalTmpDir === undefined) {
        process.env.TMPDIR = undefined;
      } else {
        process.env.TMPDIR = originalTmpDir;
      }
    }
  });

  it('handles missing TMPDIR environment variable', async () => {
    const originalTmpDir = process.env.TMPDIR;
    try {
      // Remove TMPDIR to test fallback to /tmp
      // biome-ignore lint/performance/noDelete: Required to test fallback behavior
      delete process.env.TMPDIR;
      const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

      // Verify options.cwd uses /tmp fallback
      expect(options.cwd).toBeDefined();
      expect(typeof options.cwd).toBe('string');
      expect(options.cwd).toContain('/tmp/');

      // Verify lock path uses /tmp fallback
      const lock = await acquireExecutionLockFn();
      expect(lock.lockPath).toBeDefined();
      expect(typeof lock.lockPath).toBe('string');
      expect(lock.lockPath).toContain('/tmp/');
    } finally {
      // Restore original TMPDIR
      if (originalTmpDir === undefined) {
        process.env.TMPDIR = undefined;
      } else {
        process.env.TMPDIR = originalTmpDir;
      }
    }
  });
});
