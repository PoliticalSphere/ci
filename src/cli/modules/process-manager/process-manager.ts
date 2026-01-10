/**
 * Process execution and management utilities.
 */

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

import { ProcessError } from '../../../errors/errors.ts';
import type { LogOptions } from '../../observability/logger.ts';
import { createLogger, makeLogOptions } from '../../observability/logger.ts';
import type { TraceContext } from '../../observability/tracing.ts';
import type { LinterConfig } from '../types.ts';

export interface ProcessExecutionResult {
  readonly exitCode: number;
  readonly timedOut: boolean;
}

/**
 * Run a linter process, stream logs, and respect configured timeouts.
 *
 * @param linter - Linter configuration describing how to run the tool.
 * @param logDir - Directory used for log output.
 * @param verifyMode - Whether to enable verification logging.
 * @param traceContext - Optional trace context for correlated telemetry.
 * @returns Execution result containing the exit code and timeout flag.
 */
export async function runProcess(
  linter: LinterConfig,
  logDir: string,
  verifyMode: boolean,
  traceContext?: TraceContext,
): Promise<ProcessExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), linter.timeoutMs);

  // Build LogOptions synchronously
  const baseOptions = {
    logDir,
    linterId: linter.id,
    verifyMode,
  } as const;
  const logOptions: LogOptions =
    traceContext === undefined
      ? makeLogOptions(baseOptions)
      : makeLogOptions({ ...baseOptions, traceContext });

  // Spawn the process immediately so event listeners are attached asap
  const proc = spawn(linter.binary, linter.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: controller.signal,
    shell: linter.mode === 'shell',
    detached: process.platform !== 'win32',
  });

  const combined = new Readable({ read() {} });
  let combinedEnded = false;

  const endCombined = (): void => {
    if (combinedEnded) {
      return;
    }
    combinedEnded = true;
    combined.push(null);
  };

  const forward = (chunk: Buffer): void => {
    if (combinedEnded) {
      return;
    }
    combined.push(chunk);
  };

  proc.stdout.on('data', forward);
  proc.stderr.on('data', forward);

  // Start logger asynchronously without delaying event handler registration
  const logPromise: Promise<void> = (async () => {
    const logger = await createLogger(logOptions);
    return logger(combined);
  })();
  // Attach a no-op catch immediately to prevent unhandled rejection warnings
  // when the logger fails before we explicitly await it.
  // The original promise remains rejectable when awaited later.
  logPromise.catch(() => {});

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const abortHandler = (): void => {
        endCombined();
        if (linter.mode === 'shell') {
          killProcessTree(proc);
        } else {
          killProcessTree(proc, false);
        }
        reject(new ProcessError('PROCESS_TIMEOUT', `Timeout exceeded (${linter.timeoutMs}ms)`));
      };

      proc.on('close', (code) => {
        controller.signal.removeEventListener('abort', abortHandler);
        endCombined();
        resolve(code ?? 1);
      });

      proc.on('error', (err) => {
        controller.signal.removeEventListener('abort', abortHandler);
        endCombined();
        const message = err instanceof Error ? err.message : String(err);
        reject(
          new ProcessError('PROCESS_SPAWN_FAILED', `Process spawn failed: ${message}`, {
            cause: err,
          }),
        );
      });

      controller.signal.addEventListener('abort', abortHandler, { once: true });
    });

    await logPromise;
    clearTimeout(timeout);

    return { exitCode, timedOut: false };
  } catch (err: unknown) {
    clearTimeout(timeout);
    endCombined();

    try {
      await logPromise;
    } catch {
      // Ignore logging failures during error handling
    }

    if (err instanceof ProcessError && err.code === 'PROCESS_TIMEOUT') {
      throw err;
    }
    throw err;
  }
}

/**
 * Cross-platform process tree termination with graceful shutdown attempt.
 * Tries SIGTERM first (allowing cleanup), then SIGKILL after timeout.
 */
/**
 * Terminate the given process tree, preferring graceful shutdown before SIGKILL.
 *
 * @param proc - Process to terminate.
 * @param graceful - If true, send SIGTERM before forcing SIGKILL.
 */
export function killProcessTree(proc: ReturnType<typeof spawn>, graceful = true): void {
  const GRACEFUL_KILL_TIMEOUT_MS = 5000;
  const pid = proc.pid;
  /* v8 ignore next 3 */
  if (pid === undefined || pid === 0) {
    return;
  }

  const killSignal = (signal: NodeJS.Signals): void => {
    /* v8 ignore next 7 */
    if (process.platform === 'win32') {
      // Windows: spawn taskkill to terminate process tree
      try {
        spawn(String.raw`C:\Windows\System32\taskkill.exe`, ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      } catch {
        // Fall through to direct kill
      }
    } else {
      // POSIX: kill the process group (negative pid)
      try {
        process.kill(-pid, signal);
      } catch {
        // Process group may not exist; try direct kill
        try {
          process.kill(pid, signal);
        } catch {
          // Already terminated
        }
      }
    }

    try {
      proc.kill(signal);
    } catch {
      // Process may already be terminated
    }
  };

  if (graceful) {
    // Try graceful termination first
    killSignal('SIGTERM');
    // Schedule forced kill after timeout
    /* v8 ignore next */
    setTimeout(() => killSignal('SIGKILL'), GRACEFUL_KILL_TIMEOUT_MS);
  } else {
    killSignal('SIGKILL');
  }

  // Also attempt direct process kill as fallback
  try {
    proc.kill(graceful ? 'SIGTERM' : 'SIGKILL');
  } catch {
    // Ignore - process may already be terminated
  }
}

/**
 *
 */
/**
 * Detect whether an error is transient and warrants a retry.
 *
 * @param error - Error inspected for retryable signatures.
 * @returns True when the error is a known transient condition.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof ProcessError) {
    return error.code === 'PROCESS_SPAWN_FAILED';
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('spawn') ||
      message.includes('enomem')
    );
  }

  return false;
}
