import path from 'node:path';
import { vi } from 'vitest';

export interface ExecutionDepsOverrides {
  cwd?: string;
  mkdirFn?: unknown;
  writeFileFn?: unknown;
  renameFn?: unknown;
  acquireExecutionLockFn?: unknown;
  renderDashboardFn?: unknown;
  renderWaitingHeaderFn?: unknown;
  executeLintersFn?: unknown;
  calculateSummaryFn?: unknown;
  signal?: unknown;
  console?: unknown;
}

export function buildExecutionDeps(
  tempDir: string,
  overrides: ExecutionDepsOverrides = {},
): unknown {
  return {
    cwd: tempDir,
    mkdirFn: vi.fn().mockResolvedValue(undefined),
    writeFileFn: vi.fn().mockResolvedValue(undefined),
    renameFn: vi.fn().mockResolvedValue(undefined),
    acquireExecutionLockFn: vi.fn().mockResolvedValue({
      lockPath: path.join(tempDir, 'lock'),
      release: vi.fn().mockResolvedValue(undefined),
    }),
    renderDashboardFn: vi.fn(() => ({
      updateStatus: vi.fn(),
      waitForExit: vi.fn().mockResolvedValue(undefined),
    })),
    renderWaitingHeaderFn: vi.fn(() => ({ unmount: vi.fn() })),
    executeLintersFn: vi.fn().mockResolvedValue([]),
    calculateSummaryFn: vi
      .fn()
      .mockReturnValue({ total: 0, passed: 0, failed: 0, errors: 0, duration: 0 }),
    console: { log: vi.fn(), error: vi.fn() } as unknown as typeof console,
    ...overrides,
  } as unknown;
}
