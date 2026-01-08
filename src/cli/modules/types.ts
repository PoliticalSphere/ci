/**
 * Shared types for executor modules.
 */

import type { TelemetryCollector } from '../telemetry.ts';
import type { TraceContext } from '../tracing.ts';

export type LinterStatus = 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';

export type { LinterConfig } from '../linters.ts';

export interface LinterResult {
  readonly id: string;
  readonly name: string;
  readonly status: LinterStatus;
  readonly exitCode: number | null;
  readonly error?: string;
  readonly duration: number;
  readonly logPath: string;
}

export interface ExecutionOptions {
  readonly logDir: string;
  readonly verifyMode: boolean;
  readonly concurrency?: number;
  readonly retryCount?: number;
  readonly onStatusChange?: (id: string, status: LinterStatus) => void;
  readonly traceContext?: TraceContext;
  readonly telemetry?: TelemetryCollector;
  readonly incremental?: boolean;
}
