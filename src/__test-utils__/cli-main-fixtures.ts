/**
 * Political Sphere — CLI Test Fixtures
 *
 * Role:
 *   Provide reusable mock factories and test dependency bundles for CLI tests.
 *
 * Notes:
 *   - Exported helpers create mocks for dashboard rendering, execution lock,
 *     linter execution, and other CLI dependencies used in multiple tests.
 */

import { vi } from 'vitest';

import type { LinterResult } from '../cli/executor.ts';

interface TestDeps {
  mkdirFn: ReturnType<typeof vi.fn>;
  renderDashboardFn: ReturnType<typeof vi.fn>;
  renderWaitingHeaderFn: ReturnType<typeof vi.fn>;
  executeLintersFn: ReturnType<typeof vi.fn>;
  calculateSummaryFn: ReturnType<typeof vi.fn>;
  acquireExecutionLockFn: ReturnType<typeof vi.fn>;
  options: Record<string, unknown>;
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
 * Abstract TMPDIR access behind a function so tests can mock it
 * without mutating process.env (security + compliance).
 */
export type TmpDirGetter = () => string | undefined;

let tmpDirGetter: TmpDirGetter = () => {
  // Default behaviour: read the platform env var if present
  // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
  return process.env['TMPDIR'];
};

export function setTmpDirGetter(getter: TmpDirGetter): void {
  tmpDirGetter = getter;
}

export function resetTmpDirGetter(): void {
  tmpDirGetter = () => {
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
    return process.env['TMPDIR'];
  };
}

export function getTmpDir(): string | undefined {
  return tmpDirGetter();
}

function createMkdirFn(): ReturnType<typeof vi.fn> {
  // eslint-disable-next-line unicorn/no-useless-undefined
  return vi.fn().mockResolvedValue(undefined);
}

function createRenderDashboardFn(): ReturnType<typeof vi.fn> {
  return vi.fn(() => ({
    updateStatus: vi.fn(),
    // eslint-disable-next-line unicorn/no-useless-undefined
    waitForExit: vi.fn().mockResolvedValue(undefined),
  }));
}

function createRenderWaitingHeaderFn(): ReturnType<typeof vi.fn> {
  return vi.fn(() => ({
    unmount: vi.fn(),
  }));
}

function createExecuteLintersFn(): ReturnType<typeof vi.fn> {
  return vi.fn((_linters, options: { logDir: string }) =>
    Promise.resolve(sampleResults(options.logDir)),
  );
}

function createCalculateSummaryFn(): ReturnType<typeof vi.fn> {
  return vi.fn(() => ({
    total: 1,
    passed: 1,
    failed: 0,
    errors: 0,
    duration: 5,
  }));
}

export function normaliseTmpDir(tmpDirRaw: string): string {
  return tmpDirRaw.endsWith('/') ? tmpDirRaw.slice(0, -1) : tmpDirRaw;
}

function createAcquireExecutionLockFn(): ReturnType<typeof vi.fn> {
  const tmpDirRaw = getTmpDir() ?? '/tmp';
  const tmpDir = normaliseTmpDir(tmpDirRaw);

  return vi.fn().mockResolvedValue({
    lockPath: `${tmpDir}/ps-parallel-lint-test-${process.pid}.lock`,
    release: vi.fn().mockResolvedValue(void 0),
  });
}

function buildOptions(
  argv: string[],
  deps: Omit<TestDeps, 'options'>,
  injectedConsole?: unknown,
): Record<string, unknown> {
  const tmpDirRaw = getTmpDir() ?? '/tmp';
  const tmpDir = normaliseTmpDir(tmpDirRaw);

  const options: Record<string, unknown> & { console?: unknown } = {
    argv,
    cwd: `${tmpDir}/ps-test-project-${process.pid}`,
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

export function createMainTestDeps(argv: string[], injectedConsole?: unknown): TestDeps {
  const mkdirFn = createMkdirFn();
  const renderDashboardFn = createRenderDashboardFn();
  const renderWaitingHeaderFn = createRenderWaitingHeaderFn();
  const executeLintersFn = createExecuteLintersFn();
  const calculateSummaryFn = createCalculateSummaryFn();
  const acquireExecutionLockFn = createAcquireExecutionLockFn();

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
