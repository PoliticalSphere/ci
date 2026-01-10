/**
 * Political Sphere — CLI Test Fixtures — Tests
 *
 * Guarantees:
 *   - No environment access
 *   - No legacy TMPDIR path
 *   - Temp directories are always explicit and deterministic
 */

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tmp = require('tmp');

import { createMainTestDeps, normaliseTmpDir } from './cli-main-fixtures.ts';

/**
 * Assert both paths resolve under the same temp root.
 * Does not require the paths to exist.
 */
function expectSameTempRoot(actualPath: string, injectedTempDir: string): void {
  const actualRoot = realpathSync(path.resolve(path.dirname(actualPath)));
  const injectedRoot = realpathSync(path.resolve(path.dirname(injectedTempDir)));

  expect(actualRoot).toBe(injectedRoot);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CLI test utils (explicit temp handling)', () => {
  it('creates dependencies without injecting console', async () => {
    const tmpobj = tmp.dirSync({ unsafeCleanup: true });

    try {
      const {
        options,
        renderDashboardFn,
        renderWaitingHeaderFn,
        executeLintersFn,
        calculateSummaryFn,
        acquireExecutionLockFn,
      } = createMainTestDeps(['--foo'], undefined, {
        tempDirOverride: tmpobj.name,
      });

      expect(options.console).toBeUndefined();

      mkdirSync(`${tmpobj.name}/logs`, { recursive: true });

      renderDashboardFn().updateStatus('running');
      renderWaitingHeaderFn().unmount();

      expect(calculateSummaryFn().total).toBe(1);

      const lock = await acquireExecutionLockFn();
      expectSameTempRoot(lock.lockPath, tmpobj.name);

      const logDir = `${tmpobj.name}/test-logs`;
      mkdirSync(logDir, { recursive: true });
      writeFileSync(`${logDir}/eslint.log`, 'test');

      const results = await executeLintersFn([], { logDir });
      expect(results[0]?.logPath).toBe(`${logDir}/eslint.log`);
    } finally {
      tmpobj.removeCallback();
    }
  });

  it('includes injected console and lock helpers', async () => {
    const tmpobj = tmp.dirSync({ unsafeCleanup: true });

    try {
      const fakeConsole = { log: vi.fn() };

      const { options, acquireExecutionLockFn } = createMainTestDeps([], fakeConsole, {
        tempDirOverride: tmpobj.name,
      });

      expect(options.console).toBe(fakeConsole);

      const lock = await acquireExecutionLockFn();
      expectSameTempRoot(lock.lockPath, tmpobj.name);
    } finally {
      tmpobj.removeCallback();
    }
  });

  it('uses the provided tempDirOverride verbatim (no double slashes)', async () => {
    const { options, acquireExecutionLockFn } = createMainTestDeps(['--test'], undefined, {
      tempDirOverride: '/custom/tmpdir',
    });

    expect(options.cwd).toBe(`/custom/tmpdir/ps-test-project-${process.pid}`);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath).toBe(`/custom/tmpdir/ps-parallel-lint-test-${process.pid}.lock`);
  });

  it('normalises a trailing slash in tempDirOverride', async () => {
    const { options, acquireExecutionLockFn } = createMainTestDeps(['--test'], undefined, {
      tempDirOverride: '/custom/tmpdir/',
    });

    expect(options.cwd).toBe(`/custom/tmpdir/ps-test-project-${process.pid}`);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath).toBe(`/custom/tmpdir/ps-parallel-lint-test-${process.pid}.lock`);
  });

  it('falls back to /tmp when no tempDirOverride is provided', async () => {
    const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

    expect(options.cwd).toBe(`/tmp/ps-test-project-${process.pid}`);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath).toBe(`/tmp/ps-parallel-lint-test-${process.pid}.lock`);
  });
});

/**
 * Direct unit coverage for pure normalisation logic.
 * Uses synthetic, non-environmental strings to avoid OS coupling.
 */
describe('normaliseTmpDir (direct unit coverage)', () => {
  it('removes a trailing slash when present', () => {
    expect(normaliseTmpDir('alpha/')).toBe('alpha');
    expect(normaliseTmpDir('example-path/')).toBe('example-path');
  });

  it('returns the input unchanged when no trailing slash is present', () => {
    expect(normaliseTmpDir('alpha')).toBe('alpha');
    expect(normaliseTmpDir('example-path')).toBe('example-path');
  });
});
