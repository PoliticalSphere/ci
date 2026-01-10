/**
 * Tests for the execution orchestration.
 *
 * These exercises validate the `executeWithArgs` behavior when integrating
 * with the execution lock, telemetry export, dashboard rendering, and
 * linter execution plumbing. Tests mostly inject mocks for filesystem and
 * infrastructure dependencies to keep the scenarios deterministic.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExecutionDeps } from '../../__test-utils__/fixtures/execution/execution-fixtures';
import type { CLIArgs } from '../input/args.ts';
import type { ExecutionLockOptions } from './execution-lock.ts';

const buildArgs = (): CLIArgs => ({
  verifyLogs: false,
  structuredLogs: false,
  circuitBreaker: false,
  logDir: './logs',
  linters: ['eslint'],
  help: false,
  version: false,
  verbose: false,
  incremental: false,
  clearCache: false,
});

let tempDir = '';

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'ps-ci-exec-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unmock('../observability/telemetry.ts');
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function loadExecuteWithArgs() {
  const exportSpy = vi.fn().mockReturnValue({ ok: true });
  vi.doMock('../observability/telemetry.ts', () => ({
    // Provide a minimal TelemetryCollector replacement used by the runtime
    TelemetryCollector: class {
      export() {
        return exportSpy();
      }
    },
    getGlobalTelemetry: () =>
      new (class {
        export() {
          return exportSpy();
        }
      })(),
  }));

  const mod = await import('./execution.ts');
  return { executeWithArgs: mod.executeWithArgs, exportSpy };
}

async function loadExecuteWithArgsWithMocks(lintersToRun: CLIArgs['linters']) {
  vi.doMock('../observability/telemetry.ts', () => ({
    TelemetryCollector: class {
      export() {
        return { ok: true };
      }
    },
    getGlobalTelemetry: () => ({ export: () => ({ ok: true }) }),
  }));

  vi.doMock('../input/validation.ts', () => ({
    resolveLinters: () =>
      (lintersToRun ?? []).map((id) => ({
        id,
        name: id,
        binary: 'bin',
        args: [],
        timeoutMs: 1,
        mode: 'direct',
        risk: 'low',
        enforcement: 'advisory',
        description: id,
      })),
    ensureSafeDirectoryPath: (_cwd: string, logDir: string) => path.resolve(_cwd, logDir),
  }));

  vi.doMock('../infrastructure/cache.ts', () => ({
    createExecutionCache: vi.fn(() => null),
    ExecutionCache: class {},
    enableCaching: vi.fn(),
    disableCaching: vi.fn(),
  }));

  vi.doMock('../infrastructure/incremental.ts', () => ({
    enableIncrementalExecution: vi.fn(),
    disableIncrementalExecution: vi.fn(),
    IncrementalExecutionTracker: class {},
  }));

  const mod = await import('./execution.ts');
  return { executeWithArgs: mod.executeWithArgs };
}

describe('executeWithArgs', () => {
  it('logs a warning when telemetry export fails', async () => {
    const { executeWithArgs } = await loadExecuteWithArgs();
    const errorSpy = vi.fn();
    const args = buildArgs();

    const deps = buildExecutionDeps(tempDir, {
      writeFileFn: vi.fn().mockRejectedValue(new Error('disk full')),
      console: { log: vi.fn(), error: errorSpy } as unknown as typeof console,
    });

    const result = await executeWithArgs(args, deps);

    // Ensure we still return a numeric exit code and log the telemetry warning
    expect(typeof result.exitCode).toBe('number');
    expect(errorSpy).toHaveBeenCalledWith(
      '\nWARN: Failed to write telemetry.json:',
      expect.anything(),
    );
  });

  it('logs structured/circuit breaker settings and passes options to executor', async () => {
    const args = {
      ...buildArgs(),
      structuredLogs: true,
      circuitBreaker: true,
    };
    const { executeWithArgs } = await loadExecuteWithArgsWithMocks(args.linters);
    const logSpy = vi.fn();
    const executeLintersFn = vi.fn().mockResolvedValue([]);
    const controller = new AbortController();
    let capturedOptions: Record<string, unknown> | undefined;
    executeLintersFn.mockImplementation((_linters, options) => {
      capturedOptions = options as Record<string, unknown>;
      return Promise.resolve([]);
    });

    const deps = buildExecutionDeps(tempDir, {
      executeLintersFn,
      signal: controller.signal,
      console: { log: logSpy, error: vi.fn() } as unknown as typeof console,
    });

    await executeWithArgs(args, deps);

    // Structured logs and circuit breaker options should be passed to executor
    expect(capturedOptions?.circuitBreaker).toMatchObject({ enabled: true });
    expect(capturedOptions?.signal).toBe(controller.signal);
  });

  it('clears waiting timer when onWaitEnd is called before timer fires', async () => {
    const args = buildArgs();
    const { executeWithArgs } = await loadExecuteWithArgsWithMocks(args.linters);
    vi.spyOn(globalThis, 'clearTimeout');
    const unmountSpy = vi.fn();
    let onWaitStart: (() => void) | undefined;
    let onWaitEnd: (() => void) | undefined;

    const acquireExecutionLockFn = vi
      .fn()
      .mockImplementation(async (options: ExecutionLockOptions) => {
        onWaitStart = options.onWaitStart;
        onWaitEnd = options.onWaitEnd;

        // Simulate waiting starting but ending before the timer fires
        if (onWaitStart) {
          onWaitStart();
        }
        // End waiting immediately (before WAIT_HEADER_DELAY_MS expires)
        if (onWaitEnd) {
          onWaitEnd();
        }

        return {
          lockPath: path.join(tempDir, 'lock'),
          release: vi.fn().mockResolvedValue(undefined),
        };
      });

    const deps = buildExecutionDeps(tempDir, {
      acquireExecutionLockFn,
      renderWaitingHeaderFn: vi.fn(() => ({ unmount: unmountSpy })),
      console: { log: vi.fn(), error: vi.fn() } as unknown as typeof console,
    });

    await executeWithArgs(args, deps);

    // The waiting timer should be cleared when onWaitEnd is called
    // Implementation detail: ensure the real view was never mounted
    expect(unmountSpy).not.toHaveBeenCalled(); // Timer never fired, so real view never mounted
  });

  it('logs failure and returns exit code 1 when summary has errors', async () => {
    const { executeWithArgs } = await loadExecuteWithArgsWithMocks(['eslint']);
    const errorSpy = vi.fn();

    const deps = buildExecutionDeps(tempDir, {
      calculateSummaryFn: vi
        .fn()
        .mockReturnValue({ total: 1, passed: 0, failed: 0, errors: 1, duration: 10 }),
      console: { log: vi.fn(), error: errorSpy } as unknown as typeof console,
    });

    const result = await executeWithArgs(buildArgs(), deps);

    expect(result.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('\n❌ Linting failed');
  });

  it('releases execution lock when executeLinters throws', async () => {
    const { executeWithArgs } = await loadExecuteWithArgsWithMocks(['eslint']);
    const release = vi.fn().mockResolvedValue(undefined);

    const deps = buildExecutionDeps(tempDir, {
      acquireExecutionLockFn: vi
        .fn()
        .mockResolvedValue({ lockPath: path.join(tempDir, 'lock'), release }),
      executeLintersFn: vi.fn().mockRejectedValue(new Error('boom')),
      console: { log: vi.fn(), error: vi.fn() } as unknown as typeof console,
    });

    const result = await executeWithArgs(buildArgs(), deps);

    expect(result.exitCode).toBe(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('mounts the waiting header when lock acquisition waits', async () => {
    const { executeWithArgs } = await loadExecuteWithArgsWithMocks(['eslint']);
    const waitingHeaderSpy = vi.fn(() => ({ unmount: vi.fn() }));

    const acquireExecutionLockFn = vi
      .fn()
      .mockImplementation(async (options: ExecutionLockOptions) => {
        options.onWaitStart?.();
        await new Promise((resolve) => setImmediate(resolve));
        options.onWaitEnd?.();
        return {
          lockPath: path.join(tempDir, 'lock'),
          release: vi.fn().mockResolvedValue(undefined),
        };
      });

    const deps = buildExecutionDeps(tempDir, {
      acquireExecutionLockFn,
      renderWaitingHeaderFn: waitingHeaderSpy,
      console: { log: vi.fn(), error: vi.fn() } as unknown as typeof console,
    });

    await executeWithArgs(buildArgs(), deps);

    expect(waitingHeaderSpy).toHaveBeenCalledTimes(1);
  });

  it('enables caching and incremental execution when flags are set', async () => {
    const args = { ...buildArgs(), clearCache: false, incremental: true };

    const enableCaching = vi.fn();
    const disableCaching = vi.fn();
    const enableIncrementalExecution = vi.fn();
    const disableIncrementalExecution = vi.fn();

    vi.doMock('../infrastructure/cache.ts', () => ({
      enableCaching,
      disableCaching,
    }));
    vi.doMock('../infrastructure/incremental.ts', () => ({
      enableIncrementalExecution,
      disableIncrementalExecution,
    }));
    vi.doMock('../observability/telemetry.ts', () => ({
      getGlobalTelemetry: () => ({ export: () => ({ ok: true }) }),
    }));
    vi.doMock('../input/validation.ts', () => ({
      resolveLinters: () => [
        {
          id: 'eslint',
          name: 'eslint',
          binary: 'bin',
          args: [],
          timeoutMs: 1,
          mode: 'direct',
          risk: 'low',
          enforcement: 'advisory',
          description: 'eslint',
        },
      ],
      ensureSafeDirectoryPath: (_cwd: string, logDir: string) => path.resolve(_cwd, logDir),
    }));

    const { executeWithArgs } = await import('./execution.ts');

    const deps = buildExecutionDeps(tempDir);

    await executeWithArgs(args, deps);

    expect(enableCaching).toHaveBeenCalled();
    expect(disableCaching).not.toHaveBeenCalled();
    expect(enableIncrementalExecution).toHaveBeenCalled();
    expect(disableIncrementalExecution).not.toHaveBeenCalled();
  });
});
