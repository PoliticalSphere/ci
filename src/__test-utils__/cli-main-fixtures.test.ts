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

import { describe, expect, it, vi } from 'vitest';

import { createMainTestDeps } from './cli-main-fixtures.ts';

describe('CLI test utils', () => {
  it('creates dependencies without injecting console', async () => {
    const {
      options,
      mkdirFn,
      renderDashboardFn,
      renderWaitingHeaderFn,
      executeLintersFn,
      calculateSummaryFn,
      acquireExecutionLockFn,
    } = createMainTestDeps(['--foo']);

    expect(options.console).toBeUndefined();

    // Helper to normalize temp directory
    const getTmpDir = () => {
      const tmpDir = process.env.TMPDIR || '/tmp';
      return tmpDir.endsWith('/') ? tmpDir.slice(0, -1) : tmpDir;
    };

    const tmpDir = getTmpDir();
    await mkdirFn(`${tmpDir}/logs`, { recursive: true });

    const dashboard = renderDashboardFn();
    dashboard.updateStatus('running');
    await dashboard.waitForExit();

    const waiting = renderWaitingHeaderFn();
    waiting.unmount();

    const summary = calculateSummaryFn();
    expect(summary.total).toBe(1);

    const lock = await acquireExecutionLockFn();
    await lock.release();

    const testLogDir = `${tmpDir}/test-logs`;
    const results = await executeLintersFn([], { logDir: testLogDir });
    expect(results[0]?.logPath).toBe(`${testLogDir}/eslint.log`);
  });

  it('includes injected console and lock helpers', async () => {
    const fakeConsole = { log: vi.fn() };
    const { options, acquireExecutionLockFn } = createMainTestDeps([], fakeConsole);

    expect(options.console).toBe(fakeConsole);

    const lock = await acquireExecutionLockFn();
    // Helper to normalize temp directory
    const getTmpDir = () => {
      const tmpDir = process.env.TMPDIR || '/tmp';
      return tmpDir.endsWith('/') ? tmpDir.slice(0, -1) : tmpDir;
    };
    expect(lock.lockPath).toBe(`${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`);
    await lock.release();
  });

  it('falls back to /tmp when TMPDIR is not set', async () => {
    const originalTmpdir = process.env.TMPDIR;
    // biome-ignore lint/performance/noDelete: Need to actually unset env var, not set to string "undefined"
    delete process.env.TMPDIR;

    try {
      const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

      // Verify options.cwd uses /tmp fallback
      expect(options.cwd).toBe(`/tmp/ps-test-project-${process.pid}`);

      // Verify lock path uses /tmp fallback
      const lock = await acquireExecutionLockFn();
      expect(lock.lockPath).toBe(`/tmp/ps-parallel-lint-test-${process.pid}.lock`);
      await lock.release();
    } finally {
      // Restore original TMPDIR
      if (originalTmpdir !== undefined) {
        process.env.TMPDIR = originalTmpdir;
      }
    }
  });
});
