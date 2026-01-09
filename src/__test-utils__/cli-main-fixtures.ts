/**
 * Political Sphere — CLI Test Fixtures
 *
 * Role:
 *   Provide reusable mock factories and test dependency bundles for CLI tests.
 *
 * Guarantees:
 *   - No environment access
 *   - No TMPDIR legacy path
 *   - Deterministic temp directory handling
 */

import path from 'node:path';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

import type { LinterResult } from '../cli/executor.ts';

interface SharedDeps {
  mkdirFn: Mock<() => Promise<void>>;
  renderDashboardFn: Mock<() => { updateStatus: Mock; waitForExit: Mock<() => Promise<void>> }>;
  renderWaitingHeaderFn: Mock<() => { unmount: Mock }>;
  executeLintersFn: Mock<
    (linters: unknown, options: { logDir: string }) => Promise<readonly LinterResult[]>
  >;
  calculateSummaryFn: Mock<
    () => { total: number; passed: number; failed: number; errors: number; duration: number }
  >;
  acquireExecutionLockFn: Mock<
    () => Promise<{ lockPath: string; release: Mock<() => Promise<void>> }>
  >;
}

interface TestOptions extends SharedDeps {
  argv: string[];
  cwd: string;
  console?: unknown;
}

interface TestDeps extends SharedDeps {
  options: TestOptions;
}

const sampleResults = (logDir: string): readonly LinterResult[] => [
  {
    id: 'eslint',
    name: 'ESLint',
    status: 'PASS',
    exitCode: 0,
    duration: 5,
    logPath: `${logDir}/eslint.log`,
  },
];

/**
 * Pure normalisation helper.
 */
export function normaliseTmpDir(tmpDirRaw: string): string {
  return tmpDirRaw.endsWith('/') ? tmpDirRaw.slice(0, -1) : tmpDirRaw;
}

/**
 * Resolve the effective temp directory.
 * Single source of truth. No environment access.
 */
function resolveTempDir(tempDirOverride?: string): string {
  let tmpDirRaw = tempDirOverride ?? '/tmp';

  // If a per-run temp dir (tmp-*) is injected, use its parent as the temp root
  if (typeof tempDirOverride === 'string' && path.basename(tempDirOverride).startsWith('tmp-')) {
    tmpDirRaw = path.dirname(tempDirOverride);
  }

  return normaliseTmpDir(tmpDirRaw);
}

function createMkdirFn(): Mock<() => Promise<void>> {
  // eslint-disable-next-line unicorn/no-useless-undefined
  return vi.fn().mockResolvedValue(undefined);
}

function createRenderDashboardFn(): Mock<
  () => { updateStatus: Mock; waitForExit: Mock<() => Promise<void>> }
> {
  return vi.fn(() => ({
    updateStatus: vi.fn(),
    // eslint-disable-next-line unicorn/no-useless-undefined
    waitForExit: vi.fn().mockResolvedValue(undefined),
  }));
}

function createRenderWaitingHeaderFn(): Mock<() => { unmount: Mock }> {
  return vi.fn(() => ({
    unmount: vi.fn(),
  }));
}

function createExecuteLintersFn(): Mock<
  (linters: unknown, options: { logDir: string }) => Promise<readonly LinterResult[]>
> {
  return vi.fn((_linters, options) => Promise.resolve(sampleResults(options.logDir)));
}

function createCalculateSummaryFn(): Mock<
  () => { total: number; passed: number; failed: number; errors: number; duration: number }
> {
  return vi.fn(() => ({
    total: 1,
    passed: 1,
    failed: 0,
    errors: 0,
    duration: 5,
  }));
}

function createAcquireExecutionLockFn(tempDir: string) {
  return vi.fn().mockResolvedValue({
    lockPath: `${tempDir}/ps-parallel-lint-test-${process.pid}.lock`,
    release: vi.fn().mockResolvedValue(void 0),
  });
}

function buildOptions(
  argv: string[],
  deps: Omit<TestDeps, 'options'>,
  injectedConsole: unknown,
  tempDir: string,
): TestOptions {
  const options: TestOptions = {
    argv,
    cwd: `${tempDir}/ps-test-project-${process.pid}`,
    mkdirFn: deps.mkdirFn,
    renderDashboardFn: deps.renderDashboardFn,
    renderWaitingHeaderFn: deps.renderWaitingHeaderFn,
    executeLintersFn: deps.executeLintersFn,
    calculateSummaryFn: deps.calculateSummaryFn,
    acquireExecutionLockFn: deps.acquireExecutionLockFn,
  };

  if (injectedConsole !== undefined) {
    options.console = injectedConsole;
  }

  return options;
}

export function createMainTestDeps(
  argv: string[],
  injectedConsole?: unknown,
  opts?: { tempDirOverride?: string },
): TestDeps {
  const tempDir = resolveTempDir(opts?.tempDirOverride);

  const mkdirFn = createMkdirFn();
  const renderDashboardFn = createRenderDashboardFn();
  const renderWaitingHeaderFn = createRenderWaitingHeaderFn();
  const executeLintersFn = createExecuteLintersFn();
  const calculateSummaryFn = createCalculateSummaryFn();
  const acquireExecutionLockFn = createAcquireExecutionLockFn(tempDir);

  const options = buildOptions(
    argv,
    {
      mkdirFn,
      renderDashboardFn,
      renderWaitingHeaderFn,
      executeLintersFn,
      calculateSummaryFn,
      acquireExecutionLockFn,
    },
    injectedConsole,
    tempDir,
  );

  return {
    mkdirFn,
    renderDashboardFn,
    renderWaitingHeaderFn,
    executeLintersFn,
    calculateSummaryFn,
    acquireExecutionLockFn,
    options,
  };
}
