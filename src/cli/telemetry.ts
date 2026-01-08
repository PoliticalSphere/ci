/**
 * Political Sphere — Telemetry Collection
 *
 * Role:
 *   Collect, aggregate, and export metrics about linter execution for
 *   observability and performance monitoring.
 *
 * Guarantees:
 *   - Non-blocking telemetry collection
 *   - Deterministic metric calculations
 *   - Per-linter and aggregate statistics
 *   - Sampling-aware metric collection
 */

import type { TraceContext } from './tracing.ts';

/**
 * Metrics for a single linter execution.
 */
export interface LinterMetrics {
  readonly linterId: string;
  readonly traceId: string;
  readonly startTime: number; // Unix timestamp in milliseconds
  readonly endTime: number;
  readonly outputBytes: number;
  readonly success: boolean;
  readonly errorMessage: string | undefined;
  readonly durationMs: number;
}

/**
 * Aggregated telemetry statistics.
 */
export interface TelemetryStats {
  readonly totalExecutions: number;
  readonly successfulExecutions: number;
  readonly failedExecutions: number;
  readonly totalOutputBytes: number;
  readonly averageDurationMs: number;
  readonly minDurationMs: number;
  readonly maxDurationMs: number;
  readonly sampledExecutions: number;
}

/**
 * Telemetry collector for tracking linter execution metrics.
 */
export class TelemetryCollector {
  private metrics: Map<string, LinterMetrics> = new Map();
  private readonly enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  /**
   * Start tracking a linter execution.
   * Returns a tracker object with context and start time.
   */
  startExecution(
    linterId: string,
    ctx: TraceContext,
  ): {
    readonly linterId: string;
    readonly traceId: string;
    readonly startTime: number;
  } {
    return {
      linterId,
      traceId: ctx.traceId,
      startTime: Date.now(),
    };
  }

  /**
   * Record a completed linter execution.
   */
  recordExecution(
    execution: ReturnType<TelemetryCollector['startExecution']>,
    outputBytes: number,
    success: boolean,
    errorMessage?: string,
  ): void {
    if (!this.enabled) {
      return;
    }

    const endTime = Date.now();
    const durationMs = endTime - execution.startTime;

    const metric: LinterMetrics = {
      linterId: execution.linterId,
      traceId: execution.traceId,
      startTime: execution.startTime,
      endTime,
      outputBytes,
      success,
      errorMessage: errorMessage ?? undefined,
      durationMs,
    };

    this.metrics.set(execution.traceId, metric);
  }

  /**
   * Get metrics for a specific trace.
   */
  getMetric(traceId: string): LinterMetrics | undefined {
    return this.metrics.get(traceId);
  }

  /**
   * Get all recorded metrics.
   */
  getAllMetrics(): readonly LinterMetrics[] {
    return [...this.metrics.values()];
  }

  /**
   * Clear all recorded metrics.
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Calculate aggregate statistics from all metrics.
   */
  calculateStats(filter?: (metric: LinterMetrics) => boolean): TelemetryStats {
    const filtered = filter ? this.getAllMetrics().filter((m) => filter(m)) : this.getAllMetrics();

    if (filtered.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalOutputBytes: 0,
        averageDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        sampledExecutions: 0,
      };
    }

    const successful = filtered.filter((m) => m.success).length;
    const failed = filtered.filter((m) => !m.success).length;
    const totalBytes = filtered.reduce((sum, m) => sum + m.outputBytes, 0);
    // `durationMs` is always present on `LinterMetrics`, so map directly.
    const durations = filtered.map((m) => m.durationMs);

    // Since `filtered.length > 0`, `durations` is non-empty; compute directly without branches.
    const sumDuration = durations.reduce((a, b) => a + b, 0);
    const averageDuration = sumDuration / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    return {
      totalExecutions: filtered.length,
      successfulExecutions: successful,
      failedExecutions: failed,
      totalOutputBytes: totalBytes,
      averageDurationMs: averageDuration,
      minDurationMs: minDuration,
      maxDurationMs: maxDuration,
      // All metrics include a `traceId`; sampledExecutions therefore equals total.
      sampledExecutions: filtered.length,
    };
  }

  /**
   * Export metrics as JSON for external processing.
   */
  export(): object {
    return {
      version: '1.0',
      collectedAt: new Date().toISOString(),
      metrics: this.getAllMetrics(),
      stats: this.calculateStats(),
    };
  }

  /**
   * Export metrics for a specific linter.
   */
  exportByLinter(linterId: string): object {
    const filtered = this.getAllMetrics().filter((m) => m.linterId === linterId);
    return {
      version: '1.0',
      linterId,
      collectedAt: new Date().toISOString(),
      metrics: filtered,
      stats: this.calculateStats((m) => m.linterId === linterId),
    };
  }
}

/**
 * Global telemetry collector instance (singleton).
 */
let globalCollector: TelemetryCollector | null = null;

/**
 * Get or create the global telemetry collector.
 */
export function getGlobalTelemetry(enabled = true): TelemetryCollector {
  if (!globalCollector) {
    globalCollector = new TelemetryCollector(enabled);
  }
  return globalCollector;
}

/**
 * Reset the global telemetry collector (mainly for testing).
 */
export function resetGlobalTelemetry(): void {
  if (globalCollector) {
    globalCollector.clear();
  }
}
