/**
 * Political Sphere — CLI Test Fixtures — Tests
 *
 * Fully compliant:
 *   - No direct TMPDIR access
 *   - No environment mutation
 *   - Legacy TMPDIR logic covered via mocking
 */

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tmp = require('tmp');

import * as cliFixtures from './cli-main-fixtures';
import { createMainTestDeps } from './cli-main-fixtures.ts';

/**
 * Assert both paths are derived from the same temp root.
 * Does NOT require existence or directory nesting.
 */
function expectSameTempRoot(actualPath: string, injectedTempDir: string): void {
  const actualRoot = realpathSync(path.resolve(path.dirname(actualPath)));
  const injectedRoot = realpathSync(path.resolve(path.dirname(injectedTempDir)));

  expect(actualRoot).toBe(injectedRoot);
}

/**
 * Helper to run legacy TMPDIR scenarios with dynamic test names.
 */
function runLegacyTmpDirScenario(testName: string, getterValue: string | undefined) {
  // eslint-disable-next-line vitest/valid-title
  it(testName, async () => {
    vi.spyOn(cliFixtures, 'getTmpDir').mockReturnValue(getterValue);

    const { options, acquireExecutionLockFn } = createMainTestDeps(['--test']);

    expect(options.cwd.endsWith(`ps-test-project-${process.pid}`)).toBe(true);
    expect(options.cwd.includes('//')).toBe(false);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath.endsWith(`ps-parallel-lint-test-${process.pid}.lock`)).toBe(true);
    expect(lock.lockPath.includes('//')).toBe(false);
  });
}

/**
 * Helper to run build options scenarios with dynamic test names.
 */
function runBuildOptionsScenario(testName: string, setup: () => void) {
  // eslint-disable-next-line vitest/valid-title
  it(testName, async () => {
    setup();

    const { acquireExecutionLockFn, options } = createMainTestDeps(['--test']);

    expect(options.cwd.includes('//')).toBe(false);
    expect(options.cwd.endsWith(`ps-test-project-${process.pid}`)).toBe(true);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath.includes('//')).toBe(false);
    expect(lock.lockPath.endsWith(`ps-parallel-lint-test-${process.pid}.lock`)).toBe(true);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Ensure we restore the tmp dir getter to avoid cross-test leakage
  if (typeof cliFixtures.resetTmpDirGetter === 'function') {
    cliFixtures.resetTmpDirGetter();
  }
});

describe('CLI test utils (preferred temp handling)', () => {
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
});

describe('CLI test utils (legacy TMPDIR normalisation — compliant)', () => {
  // Reuse module-scope helper `runLegacyTmpDirScenario`
  runLegacyTmpDirScenario('normalises TMPDIR with trailing slash', '/tmp/');
  runLegacyTmpDirScenario('uses TMPDIR as-is when no trailing slash is present', '/custom-tmp');
  runLegacyTmpDirScenario('falls back correctly when TMPDIR is undefined', undefined);
});

/**
 * Direct unit coverage for pure normalisation logic.
 * This exists to satisfy branch coverage for `normaliseTmpDir`
 * without relying on higher-level integration behaviour.
 */
describe('normaliseTmpDir (direct unit coverage)', () => {
  it('removes a trailing slash when present', () => {
    expect(cliFixtures.normaliseTmpDir('/tmp/')).toBe('/tmp');
    expect(cliFixtures.normaliseTmpDir('/custom/path/')).toBe('/custom/path');
  });

  it('returns the input unchanged when no trailing slash is present', () => {
    expect(cliFixtures.normaliseTmpDir('/tmp')).toBe('/tmp');
    expect(cliFixtures.normaliseTmpDir('/custom/path')).toBe('/custom/path');
  });
});

/**
 * Branch coverage for createAcquireExecutionLockFn and buildOptions
 * ensuring both branches of `getTmpDir() ?? '/tmp'` are exercised.
 */
describe('createAcquireExecutionLockFn and buildOptions (branch coverage)', () => {
  runBuildOptionsScenario('takes the fallback branch when getTmpDir returns undefined', () => {
    vi.spyOn(cliFixtures, 'getTmpDir').mockReturnValue(undefined);
  });

  runBuildOptionsScenario('takes the non-null branch when getTmpDir returns a value', () => {
    vi.spyOn(cliFixtures, 'getTmpDir').mockReturnValue('/custom-test-tmp');
  });

  runBuildOptionsScenario('honours an injected tmp dir getter (trailing slash)', () => {
    cliFixtures.setTmpDirGetter(() => '/injected/tmpdir/');
  });

  runBuildOptionsScenario(
    'honours an injected tmp dir getter returning undefined (fallback)',
    () => {
      cliFixtures.setTmpDirGetter(() => undefined);
    },
  );
});
