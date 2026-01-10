/**
 * Political Sphere — CLI Main Execution
 *
 * Role:
 *   Orchestrate linter execution with proper initialization and cleanup.
 *
 * Responsibilities:
 *   - Initialize caching and incremental execution based on flags
 *   - Acquire execution lock to prevent concurrent runs
 *   - Execute linters and render dashboard
 *   - Calculate summary and determine exit code
 *   - Handle telemetry export and cleanup
 *   - Manage all error handling and finally blocks
 */

import { Console } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { disableCaching, enableCaching } from '../infrastructure/cache.ts';
import {
  disableIncrementalExecution,
  enableIncrementalExecution,
} from '../infrastructure/incremental.ts';
import type { CLIArgs } from '../input/args.ts';
import { ensureSafeDirectoryPath, resolveLinters } from '../input/validation.ts';
import { getGlobalTelemetry } from '../observability/telemetry.ts';
import { createTraceContext } from '../observability/tracing.ts';
import { renderDashboard, renderWaitingHeader, WAITING_HEADER_MESSAGE } from '../output/ui.tsx';
import { acquireExecutionLock } from './execution-lock.ts';
import type { ExecutionSummary, LinterStatus } from './executor.ts';
import { calculateSummary, executeLintersInParallel } from './executor.ts';

/**
 * Dependency overrides supplied when invoking `executeWithArgs`.
 *
 * Allows callers (tests or alternative entrypoints) to supply mocks for
 * filesystem helpers, dashboard rendering, lock management, or signal control.
 */
export interface MainDeps {
  readonly argv?: readonly string[];
  readonly mkdirFn?: typeof mkdir;
  readonly writeFileFn?: typeof writeFile;
  readonly renderDashboardFn?: typeof renderDashboard;
  readonly renderWaitingHeaderFn?: typeof renderWaitingHeader;
  readonly executeLintersFn?: typeof executeLintersInParallel;
  readonly calculateSummaryFn?: typeof calculateSummary;
  readonly acquireExecutionLockFn?: typeof acquireExecutionLock;
  readonly cwd?: string;
  readonly lockPath?: string;
  readonly console?: typeof console;
  readonly signal?: AbortSignal;
}

/**
 * Result returned from `executeWithArgs`.
 */
export interface MainResult {
  readonly exitCode: number;
  readonly summary?: ExecutionSummary;
}

/**
 * Execute CLI with provided args and optional dependency overrides.
 */
export async function executeWithArgs(
  args: CLIArgs,
  deps: Partial<MainDeps> & { cwd?: string; console?: typeof console } = {},
): Promise<MainResult> {
  const {
    mkdirFn = mkdir,
    writeFileFn = writeFile,
    renderDashboardFn = renderDashboard,
    renderWaitingHeaderFn = renderWaitingHeader,
    executeLintersFn = executeLintersInParallel,
    calculateSummaryFn = calculateSummary,
    acquireExecutionLockFn = acquireExecutionLock,
    cwd = process.cwd(),
    console: injectedConsole,
    signal,
  } = deps;

  const stdout = process.stdout;
  const stderr = process.stderr;
  const scopedConsole = injectedConsole ?? new Console({ stdout, stderr });
  const log = scopedConsole.log.bind(scopedConsole);
  const error = scopedConsole.error.bind(scopedConsole);
  let releaseLock: (() => Promise<void>) | undefined;
  let waitingView: { unmount: () => void } | undefined;
  let waitingScheduled = false;
  let rootTrace: ReturnType<typeof createTraceContext> | undefined;
  let telemetryCollector: ReturnType<typeof getGlobalTelemetry> | undefined;
  let logDirForTelemetry: string | undefined;

  try {
    // Extract mode configuration to helpers for readability and reduced complexity
    /**
     * Enable or disable caching and incremental execution based on CLI args.
     */
    const configureModes = () => {
      if (args.clearCache) {
        disableCaching();
        log('ℹ️  Caching disabled (--clear-cache flag set)\n');
      } else {
        enableCaching();
      }

      if (args.incremental) {
        enableIncrementalExecution();
        log('ℹ️  Incremental execution enabled (--incremental flag set)\n');
      } else {
        disableIncrementalExecution();
      }
    };

    configureModes();

    const lintersToRun = resolveLinters(args.linters);
    const logDir = ensureSafeDirectoryPath(cwd, args.logDir);

    // Prepare root trace and telemetry collector for this CLI execution
    rootTrace = createTraceContext();
    telemetryCollector = getGlobalTelemetry();
    logDirForTelemetry = logDir;

    /**
     * Initialize the waiting header view if execution lock acquisition begins to wait.
     */
    const handleWaitStart = () => {
      waitingScheduled = true;
      queueMicrotask(() => {
        if (!waitingScheduled) {
          return;
        }
        waitingView = renderWaitingHeaderFn(WAITING_HEADER_MESSAGE, { stdout, stderr });
        waitingScheduled = false;
      });
    };

    /**
     * Cancel any pending waiting header mount and tear down the view.
     */
    const handleWaitEnd = () => {
      // Cancel the scheduled mount if it hasn't happened yet
      waitingScheduled = false;
      if (waitingView) {
        waitingView.unmount();
        waitingView = undefined;
      }
    };

    const executionLock = await acquireExecutionLockFn({
      onWaitStart: handleWaitStart,
      onWaitEnd: handleWaitEnd,
    });
    releaseLock = executionLock.release;

    // Fail early before side effects
    await mkdirFn(logDir, { recursive: true });

    log('🚀 Political Sphere Parallel Linter\n');
    log(`Linters: ${lintersToRun.length}`);
    log(`Log directory: ${logDir}`);
    log(`Verification mode: ${args.verifyLogs ? 'ENABLED' : 'DISABLED'}`);
    if (args.verbose) {
      log(`Verbose mode: ENABLED`);
      log(`Working directory: ${cwd}`);
      log(`Requested linters: ${args.linters?.join(', ') ?? 'all'}`);
    }
    log('');

    const dashboard = renderDashboardFn(lintersToRun, logDir, { stdout, stderr });
    const updateStatus = (id: string, status: LinterStatus) => dashboard.updateStatus(id, status);
    const waitForExit = () => dashboard.waitForExit();
    const startTime = Date.now();

    const results = await executeLintersFn(lintersToRun, {
      logDir,
      verifyMode: args.verifyLogs,
      incremental: args.incremental,
      traceContext: rootTrace,
      telemetry: telemetryCollector,
      signal,
      circuitBreaker: { enabled: Boolean(args.circuitBreaker) },
      structuredLogs: Boolean(args.structuredLogs),
      onStatusChange: (id: string, status: LinterStatus) => {
        updateStatus(id, status);
      },
    });

    await waitForExit();

    const summary = calculateSummaryFn(results, Date.now() - startTime);

    if (summary.errors > 0 || summary.failed > 0) {
      error('\n❌ Linting failed');
      process.exitCode = 1;
      return { exitCode: 1, summary };
    }

    log('\n✅ All linters passed');
    process.exitCode = 0;
    return { exitCode: 0, summary };
  } catch (err) {
    error('\n❌ Fatal error:', err);
    process.exitCode = 1;
    return { exitCode: 1 };
  } finally {
    // Cancel any scheduled waiting mount
    waitingScheduled = false;

    if (waitingView) {
      waitingView.unmount();
      waitingView = undefined;
    }

    if (releaseLock) {
      try {
        await releaseLock();
      } catch (releaseError) {
        error('\nWARN: Failed to release execution lock:', releaseError);
      }
    }
    // Export telemetry to the log directory (best-effort)
    if (telemetryCollector && logDirForTelemetry !== undefined) {
      try {
        const out = telemetryCollector.export();
        await writeFileFn(
          path.join(logDirForTelemetry, 'telemetry.json'),
          JSON.stringify(out, null, 2),
          'utf8',
        );
      } catch (error_) {
        error('\nWARN: Failed to write telemetry.json:', error_);
      }
    }
  }
}
