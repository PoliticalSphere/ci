/**
 * Tests for result builder module
 */

import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { buildResult, calculateSummary, determineStatus } from '../modules/result-builder.ts';

describe('Result Builder Module', () => {
  const testTmpDir = tmpdir().replace(/\/$/, '');
  const buildCtx = (startOffset = 100) => ({
    linter: {
      id: 'test',
      name: 'Test',
      binary: 'test',
      args: [],
      timeoutMs: 1000,
      mode: 'direct' as const,
      risk: 'low' as const,
      enforcement: 'advisory' as const,
      description: 'Test linter',
    },
    logPath: `${testTmpDir}/test.log`,
    start: Date.now() - startOffset,
  });

  describe('buildResult', () => {
    it('includes error when provided', () => {
      const ctx = buildCtx();

      const result = buildResult(ctx, 'ERROR', null, 'Test error');
      expect(result.error).toBe('Test error');
      expect(result.status).toBe('ERROR');
    });

    it('excludes error when not provided', () => {
      const ctx = buildCtx();

      const result = buildResult(ctx, 'PASS', 0);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe('PASS');
    });

    it('calculates duration correctly', () => {
      const ctx = buildCtx(500);

      const result = buildResult(ctx, 'PASS', 0);
      expect(result.duration).toBeGreaterThanOrEqual(400);
    });
  });

  describe('determineStatus', () => {
    it('returns PASS for zero exit code', async () => {
      const status = await determineStatus('eslint', 0, `${testTmpDir}/test.log`);
      expect(status).toBe('PASS');
    });

    it('returns FAIL for non-zero exit code', async () => {
      const status = await determineStatus('eslint', 1, `${testTmpDir}/test.log`);
      expect(status).toBe('FAIL');
    });

    it('handles jscpd with zero exit code', async () => {
      const status = await determineStatus('jscpd', 0, `${testTmpDir}/jscpd.log`);
      expect(status).toBe('PASS');
    });

    it('handles jscpd with non-zero exit code', async () => {
      const status = await determineStatus('jscpd', 1, `${testTmpDir}/jscpd.log`);
      expect(status).toBe('FAIL');
    });

    it('handles knip with detector function', async () => {
      const mockDetector = async () => false;
      const status = await determineStatus('knip', 0, `${testTmpDir}/knip.log`, mockDetector);
      expect(status).toBe('PASS');
    });

    it('handles knip findings', async () => {
      const mockDetector = async () => true;
      const status = await determineStatus('knip', 0, `${testTmpDir}/knip.log`, mockDetector);
      expect(status).toBe('FAIL');
    });
  });

  describe('calculateSummary', () => {
    it('counts results correctly', () => {
      const results = [
        {
          id: 'a',
          name: 'A',
          status: 'PASS' as const,
          exitCode: 0,
          duration: 100,
          logPath: `${testTmpDir}/a.log`,
        },
        {
          id: 'b',
          name: 'B',
          status: 'FAIL' as const,
          exitCode: 1,
          duration: 200,
          logPath: `${testTmpDir}/b.log`,
        },
        {
          id: 'c',
          name: 'C',
          status: 'ERROR' as const,
          exitCode: null,
          error: 'err',
          duration: 50,
          logPath: `${testTmpDir}/c.log`,
        },
        {
          id: 'd',
          name: 'D',
          status: 'SKIPPED' as const,
          exitCode: null,
          duration: 10,
          logPath: `${testTmpDir}/d.log`,
        },
      ];

      const summary = calculateSummary(results, 1000);
      expect(summary.total).toBe(4);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.duration).toBe(1000);
    });

    it('handles empty results', () => {
      const summary = calculateSummary([], 0);
      expect(summary.total).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.errors).toBe(0);
    });
  });
});
