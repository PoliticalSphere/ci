/**
 * Political Sphere — Parallel Execution Engine
 *
 * Role:
 *   Deterministic, policy-aware execution of linters with concurrency control.
 *
 * Responsibilities:
 *   - Execute processes safely and in parallel
 *   - Capture logs and timing
 *   - Report normalized results
 *   - Track distributed traces and telemetry
 *
 * Non-responsibilities:
 *   - No policy decisions
 *   - No linter-specific knowledge
 */

import { cpus } from 'node:os';
import pMap from 'p-map';

import { formatErrorMessage } from '../../errors/errors.ts';
import { getGlobalTracker } from '../infrastructure/incremental.ts';
import {
  buildResult,
  checkBinaryExists,
  detectKnipFindings,
  determineStatus,
  type ExecutionOptions,
  isTransientError,
  type LinterConfig,
  type LinterResult,
  type LinterStatus,
  runProcess,
  shouldSkipLinter,
  verifyLinterVersion,
} from '../modules/index.ts';
import { appendToLog } from '../observability/logger.ts';
import { getGlobalTelemetry } from '../observability/telemetry.ts';
import { createChildTraceContext, createTraceContext } from '../observability/tracing.ts';

export type {
  ExecutionSummary,
  LinterResult,
  LinterStatus,
} from '../modules/index.ts';
export { calculateSummary } from '../modules/index.ts';

const DEFAULT_RETRY_COUNT = 0;
const RETRY_DELAY_MS = 1000;

/**
 * Execute a single linter with retry logic, tracing, telemetry, and incremental awareness.
 */
export async function executeLinter(
  linter: LinterConfig,
  options: ExecutionOptions,
  retryCount = DEFAULT_RETRY_COUNT,
): Promise<LinterResult> {
  const start = Date.now();
  const logPath = `${options.logDir}/${linter.id}.log`;
  const ctx = { linter, logPath, start };

  // Create trace context for this linter execution
  const traceContext = options.traceContext
    ? createChildTraceContext(options.traceContext)
    : createTraceContext();

  // Get telemetry collector and start execution tracking
  const telemetry = options.telemetry ?? getGlobalTelemetry();
  const execution = telemetry.startExecution(linter.id, traceContext);

  options.onStatusChange?.(linter.id, 'RUNNING' as LinterStatus);

  try {
    const fail = async (message: string): Promise<LinterResult> => {
      await appendToLog(options.logDir, linter.id, `ERROR: ${message}`);
      options.onStatusChange?.(linter.id, 'ERROR' as LinterStatus);
      telemetry.recordExecution(execution, 0, false, message);
      return buildResult(ctx, 'ERROR' as LinterStatus, null, message);
    };

    // Check incremental execution (if enabled)
    const checkIncrementalSkip = async () => {
      const tracker = getGlobalTracker();
      if (tracker && options.incremental === true) {
        const incrementalDecision = tracker.getExecutionDecision(linter.id);
        if (!incrementalDecision.shouldExecute) {
          await appendToLog(
            options.logDir,
            linter.id,
            `SKIPPED (incremental): ${incrementalDecision.reason}`,
          );
          options.onStatusChange?.(linter.id, 'SKIPPED' as LinterStatus);
          telemetry.recordExecution(execution, 0, true);
          return buildResult(ctx, 'SKIPPED' as LinterStatus, null, incrementalDecision.reason);
        }
      }
      return null;
    };

    const maybeSkipped = await checkIncrementalSkip();
    if (maybeSkipped) {
      return maybeSkipped;
    }

    // Check if linter should be skipped
    const decision = linter.skipCheck ? await linter.skipCheck() : await shouldSkipLinter(linter);
    if (decision?.skip === true) {
      const reason = decision.reason ?? 'No relevant files found';
      await appendToLog(options.logDir, linter.id, `SKIPPED: ${reason}`);
      options.onStatusChange?.(linter.id, 'SKIPPED' as LinterStatus);
      telemetry.recordExecution(execution, 0, true);
      return buildResult(ctx, 'SKIPPED' as LinterStatus, null, reason);
    }

    // Check binary availability
    if (!(await checkBinaryExists(linter.binary))) {
      const error = `Binary not found: ${linter.binary}`;
      return await fail(error);
    }

    // Verify pinned versions when configured
    try {
      await verifyLinterVersion(linter);
    } catch (err: unknown) {
      const message = formatErrorMessage(err);
      return await fail(message);
    }

    // Execute with retry logic
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const { exitCode } = await runProcess(
          linter,
          options.logDir,
          options.verifyMode,
          traceContext,
        );
        const status = await determineStatus(linter.id, exitCode, logPath, detectKnipFindings);
        options.onStatusChange?.(linter.id, status);

        // Record telemetry - estimate output bytes from log file
        const success = status === 'PASS' || status === 'SKIPPED';
        telemetry.recordExecution(execution, 0, success);

        return buildResult(ctx, status, exitCode);
      } catch (err: unknown) {
        lastError = err;
        if (!isTransientError(err) || attempt === retryCount) {
          break;
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    // All retries exhausted or non-transient error
    const message = formatErrorMessage(lastError);
    return await fail(message);
  } catch (err: unknown) {
    // Catch-all for unexpected errors
    const message = formatErrorMessage(err);
    telemetry.recordExecution(execution, 0, false, message);
    throw err;
  }
}

/**
 * Execute multiple linters in parallel using configurable concurrency.
 *
 * @param linters - List of configured linters to run.
 * @param options - Execution options shared between runs.
 * @returns An array of `LinterResult` objects in registry order.
 */
export async function executeLintersInParallel(
  linters: readonly LinterConfig[],
  options: ExecutionOptions,
): Promise<readonly LinterResult[]> {
  const concurrency = options.concurrency ?? Math.max(1, cpus().length - 1);
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;

  return pMap(linters, (l) => executeLinter(l, options, retryCount), { concurrency });
}
