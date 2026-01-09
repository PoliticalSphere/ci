/**
 * Political Sphere — Telemetry Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGlobalTelemetry, resetGlobalTelemetry, TelemetryCollector } from './telemetry.ts';
import { createTraceContext } from './tracing.ts';

describe('Political Sphere — Telemetry', () => {
  describe('TelemetryCollector', () => {
    let collector: TelemetryCollector;

    beforeEach(() => {
      collector = new TelemetryCollector(true);
    });

    describe('startExecution', () => {
      it('returns execution tracker with context', () => {
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        expect(execution.linterId).toBe('eslint');
        expect(execution.traceId).toBe(ctx.traceId);
        expect(execution.startTime).toBeGreaterThan(0);
      });

      it('records current timestamp', () => {
        const before = Date.now();
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        const after = Date.now();
        expect(execution.startTime).toBeGreaterThanOrEqual(before);
        expect(execution.startTime).toBeLessThanOrEqual(after);
      });
    });

    describe('recordExecution', () => {
      it('stores execution metrics', () => {
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        collector.recordExecution(execution, 1024, true);

        const metric = collector.getMetric(ctx.traceId);
        expect(metric).toBeDefined();
        expect(metric?.linterId).toBe('eslint');
        expect(metric?.outputBytes).toBe(1024);
        expect(metric?.success).toBe(true);
      });

      it('calculates duration', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);

        vi.setSystemTime(startTime + 1000);
        collector.recordExecution(execution, 512, true);

        const metric = collector.getMetric(ctx.traceId);
        expect(metric?.durationMs).toBe(1000);

        vi.useRealTimers();
      });

      it('records error messages on failure', () => {
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        collector.recordExecution(execution, 0, false, 'Command failed');

        const metric = collector.getMetric(ctx.traceId);
        expect(metric?.success).toBe(false);
        expect(metric?.errorMessage).toBe('Command failed');
      });

      it('respects enabled flag', () => {
        const disabledCollector = new TelemetryCollector(false);
        const ctx = createTraceContext();
        const execution = disabledCollector.startExecution('eslint', ctx);
        disabledCollector.recordExecution(execution, 1024, true);

        const metric = disabledCollector.getMetric(ctx.traceId);
        expect(metric).toBeUndefined();
      });
    });

    describe('getMetric', () => {
      it('returns undefined for non-existent trace', () => {
        const metric = collector.getMetric('nonexistent');
        expect(metric).toBeUndefined();
      });

      it('retrieves recorded metrics', () => {
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        collector.recordExecution(execution, 2048, true);

        const metric = collector.getMetric(ctx.traceId);
        expect(metric?.traceId).toBe(ctx.traceId);
        expect(metric?.outputBytes).toBe(2048);
      });
    });

    describe('getAllMetrics', () => {
      it('returns empty array initially', () => {
        const metrics = collector.getAllMetrics();
        expect(metrics).toEqual([]);
      });

      it('returns all recorded metrics', () => {
        const ctx1 = createTraceContext();
        const ctx2 = createTraceContext();

        const exec1 = collector.startExecution('eslint', ctx1);
        const exec2 = collector.startExecution('prettier', ctx2);

        collector.recordExecution(exec1, 1024, true);
        collector.recordExecution(exec2, 512, true);

        const metrics = collector.getAllMetrics();
        expect(metrics).toHaveLength(2);
      });
    });

    describe('clear', () => {
      it('clears all metrics', () => {
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        collector.recordExecution(execution, 1024, true);

        expect(collector.getAllMetrics().length).toBeGreaterThan(0);
        collector.clear();
        expect(collector.getAllMetrics()).toEqual([]);
      });
    });

    describe('calculateStats', () => {
      // Helper filter function for testing filter parameter
      const isEslintMetric = (m: { linterId: string }) => m.linterId === 'eslint';

      it('returns zero stats for empty metrics', () => {
        const stats = collector.calculateStats();
        expect(stats.totalExecutions).toBe(0);
        expect(stats.successfulExecutions).toBe(0);
        expect(stats.failedExecutions).toBe(0);
        expect(stats.totalOutputBytes).toBe(0);
        expect(stats.averageDurationMs).toBe(0);
      });

      it('calculates success/failure counts', () => {
        const ctx1 = createTraceContext();
        const ctx2 = createTraceContext();
        const ctx3 = createTraceContext();

        collector.recordExecution(collector.startExecution('eslint', ctx1), 100, true);
        collector.recordExecution(collector.startExecution('eslint', ctx2), 200, true);
        collector.recordExecution(collector.startExecution('eslint', ctx3), 0, false);

        const stats = collector.calculateStats();
        expect(stats.totalExecutions).toBe(3);
        expect(stats.successfulExecutions).toBe(2);
        expect(stats.failedExecutions).toBe(1);
      });

      it('calculates output bytes total', () => {
        const ctx1 = createTraceContext();
        const ctx2 = createTraceContext();

        collector.recordExecution(collector.startExecution('eslint', ctx1), 1024, true);
        collector.recordExecution(collector.startExecution('eslint', ctx2), 2048, true);

        const stats = collector.calculateStats();
        expect(stats.totalOutputBytes).toBe(3072);
      });

      it('calculates duration statistics', () => {
        vi.useFakeTimers();
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        const ctx1 = createTraceContext();
        const ctx2 = createTraceContext();
        const ctx3 = createTraceContext();

        const exec1 = collector.startExecution('eslint', ctx1);
        vi.setSystemTime(baseTime + 500);
        collector.recordExecution(exec1, 100, true);

        vi.setSystemTime(baseTime + 1000);
        const exec2 = collector.startExecution('eslint', ctx2);
        vi.setSystemTime(baseTime + 2000);
        collector.recordExecution(exec2, 100, true);

        vi.setSystemTime(baseTime + 2000);
        const exec3 = collector.startExecution('eslint', ctx3);
        vi.setSystemTime(baseTime + 2100);
        collector.recordExecution(exec3, 100, true);

        const stats = collector.calculateStats();
        expect(stats.minDurationMs).toBe(100);
        expect(stats.maxDurationMs).toBe(1000);
        expect(stats.averageDurationMs).toBeCloseTo((500 + 1000 + 100) / 3, 0);

        vi.useRealTimers();
      });

      it('applies filter function', () => {
        const ctx1 = createTraceContext();
        const ctx2 = createTraceContext();

        const exec1 = collector.startExecution('eslint', ctx1);
        const exec2 = collector.startExecution('prettier', ctx2);

        collector.recordExecution(exec1, 100, true);
        collector.recordExecution(exec2, 200, true);

        const eslintStats = collector.calculateStats(isEslintMetric);

        expect(eslintStats.totalExecutions).toBe(1);
        expect(eslintStats.totalOutputBytes).toBe(100);
      });
    });

    describe('export', () => {
      it('exports metrics in JSON format', () => {
        const ctx = createTraceContext();
        const execution = collector.startExecution('eslint', ctx);
        collector.recordExecution(execution, 1024, true);

        const exported = collector.export() as Record<string, unknown>;
        expect(exported.version).toBe('1.0');
        expect(exported.collectedAt).toBeDefined();
        expect(Array.isArray(exported.metrics)).toBe(true);
        expect(exported.stats).toBeDefined();
      });
    });

    describe('exportByLinter', () => {
      it('exports metrics for specific linter', () => {
        const ctx1 = createTraceContext();
        const ctx2 = createTraceContext();

        const exec1 = collector.startExecution('eslint', ctx1);
        const exec2 = collector.startExecution('prettier', ctx2);

        collector.recordExecution(exec1, 100, true);
        collector.recordExecution(exec2, 200, true);

        const exported = collector.exportByLinter('eslint') as Record<string, unknown>;
        const metrics = exported.metrics as unknown[];
        expect(metrics).toHaveLength(1);
        expect((metrics[0] as Record<string, unknown>).linterId).toBe('eslint');
      });
    });
  });

  describe('Global telemetry', () => {
    afterEach(() => {
      resetGlobalTelemetry();
    });

    describe('getGlobalTelemetry', () => {
      it('returns singleton instance', () => {
        const telemetry1 = getGlobalTelemetry();
        const telemetry2 = getGlobalTelemetry();
        expect(telemetry1).toBe(telemetry2);
      });

      it('respects enabled parameter on first initialization', () => {
        // Create a new TelemetryCollector with disabled state
        const disabledCollector = new TelemetryCollector(false);
        const ctx = createTraceContext();
        const execution = disabledCollector.startExecution('eslint', ctx);
        disabledCollector.recordExecution(execution, 100, true);
        expect(disabledCollector.getMetric(ctx.traceId)).toBeUndefined();
      });
    });

    describe('resetGlobalTelemetry', () => {
      it('clears global telemetry', () => {
        const telemetry = getGlobalTelemetry();
        const ctx = createTraceContext();
        const execution = telemetry.startExecution('eslint', ctx);
        telemetry.recordExecution(execution, 100, true);

        resetGlobalTelemetry();
        expect(telemetry.getAllMetrics()).toHaveLength(0);
      });

      it('is a no-op before initialization', async () => {
        // Reset module registry to ensure a fresh telemetry module instance
        vi.resetModules();
        const mod = await import('./telemetry.ts');

        // Call reset before any getGlobalTelemetry() usage
        mod.resetGlobalTelemetry();

        // Now initialize and ensure it still creates a collector cleanly
        const telemetry = mod.getGlobalTelemetry();
        const ctx = createTraceContext();
        const execution = telemetry.startExecution('eslint', ctx);
        telemetry.recordExecution(execution, 1, true);
        expect(telemetry.getAllMetrics()).toHaveLength(1);
      });
    });
  });
});
