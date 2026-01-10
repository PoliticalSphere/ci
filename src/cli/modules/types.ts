/**
 * Shared types for executor modules.
 */

import type { TelemetryCollector } from '../observability/telemetry.ts';
import type { TraceContext } from '../observability/tracing.ts';

/** Lints can report these statuses during execution. */
export type LinterStatus = 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';

/** Normalized execution result emitted by the executor per linter. */
export interface LinterResult {
  /** Linter identifier (e.g., "eslint"). */
  readonly id: string;
  /** Human-friendly linter name. */
  readonly name: string;
  /** Execution status. */
  readonly status: LinterStatus;
  /** Process exit code when available. */
  readonly exitCode: number | null;
  /** Optional error message emitted by the linter. */
  readonly error?: string;
  /** Milliseconds elapsed since the execution started. */
  readonly duration: number;
  /** Absolute path to the log file created for the run. */
  readonly logPath: string;
}

/**
 * Options directly consumed by `executeLintersInParallel`.
 *
 * @remarks
 * Extended by the executor to add telemetry, tracing, and structured log hints.
 */
export interface ExecutionOptions {
  /** Directory where each linter writes its log file. */
  readonly logDir: string;
  /** Controls whether verification-mode logging is enabled. */
  readonly verifyMode: boolean;
  /** Optional concurrency override for `p-map`. */
  readonly concurrency?: number;
  /** Number of retry attempts when transient errors occur. */
  readonly retryCount?: number;
  /** Callback invoked each time a linter status changes. */
  readonly onStatusChange?: (id: string, status: LinterStatus) => void;
  /** Optional trace context used for distributed tracing. */
  readonly traceContext?: TraceContext;
  /** Signal used to cancel execution (e.g., Ctrl+C). */
  readonly signal?: AbortSignal | undefined;
  /** Optional telemetry collector for recording metrics. */
  readonly telemetry?: TelemetryCollector;
  /** When true, incremental execution decisions are honored. */
  readonly incremental?: boolean;
  /** Circuit breaker configuration passed down to the executor. */
  readonly circuitBreaker?: { readonly enabled: boolean };
  /** Whether the executor should produce structured logs. */
  readonly structuredLogs?: boolean;
}

export type { LinterConfig } from '../config/index.ts';
