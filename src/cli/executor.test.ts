/**
 * Integration tests for executor module
 */

import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BinaryError } from '../errors.ts';
import { calculateSummary, executeLinter } from './executor.ts';

// Mock modules before importing executor functions that use them
vi.mock('./modules/index.ts', async () => {
  const actual = await vi.importActual<typeof import('./modules/index.ts')>('./modules/index.ts');
  return {
    ...actual,
    checkBinaryExists: vi.fn(),
    determineStatus: vi.fn(),
    detectKnipFindings: vi.fn(),
    isTransientError: vi.fn(),
    runProcess: vi.fn(),
    shouldSkipLinter: vi.fn(),
    verifyLinterVersion: vi.fn(),
  };
});

vi.mock('./logger.ts', () => ({
  appendToLog: vi.fn().mockResolvedValue(undefined),
}));

const telemetryMock = {
  startExecution: vi.fn(() => ({})),
  recordExecution: vi.fn(),
};

vi.mock('./telemetry.ts', () => ({
  getGlobalTelemetry: vi.fn(() => telemetryMock),
}));

vi.mock('./incremental.ts', () => ({
  getGlobalTracker: vi.fn(() => null),
}));

describe('Executor Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateSummary', () => {
    it('re-exports calculateSummary', () => {
      expect(typeof calculateSummary).toBe('function');
    });
  });

  describe('executeLinter', () => {
    const mockOptions = {
      logDir: `${tmpdir()}/test-logs-${process.pid}`,
      verifyMode: false,
      onStatusChange: vi.fn(),
    };

    const mockLinter = {
      id: 'test-linter',
      name: 'Test Linter',
      binary: 'test-bin',
      args: [],
      skipCheck: undefined,
      expectedVersion: undefined,
    };

    it('returns SKIPPED when linter should be skipped (line 56-62)', async () => {
      const { shouldSkipLinter } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({
        skip: true,
        reason: 'No files found',
      });

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('SKIPPED');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'SKIPPED');
    });

    it('returns ERROR when binary does not exist (line 68-74)', async () => {
      const { shouldSkipLinter, checkBinaryExists } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(false);

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('Binary not found');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('returns ERROR when version verification throws error (line 78-84)', async () => {
      const { shouldSkipLinter, checkBinaryExists, verifyLinterVersion } = await import(
        './modules/index.ts'
      );
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockRejectedValueOnce(
        new BinaryError('BINARY_VERSION_MISMATCH', 'Version mismatch'),
      );

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('BINARY_VERSION_MISMATCH');
      expect(result.error).toContain('Version mismatch');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('returns ERROR when version verification throws exception (line 85-91)', async () => {
      const { shouldSkipLinter, checkBinaryExists, verifyLinterVersion } = await import(
        './modules/index.ts'
      );
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockRejectedValueOnce(new Error('Version check failed'));

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('Version check failed');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('returns ERROR when version verification throws non-Error exception (line 83)', async () => {
      const { shouldSkipLinter, checkBinaryExists, verifyLinterVersion } = await import(
        './modules/index.ts'
      );
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockRejectedValueOnce('string error');

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('string error');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('skips when incremental tracker says no execution (lines 79-88)', async () => {
      const { getGlobalTracker } = await import('./incremental.ts');
      const { appendToLog } = await import('./logger.ts');

      const tracker = {
        getExecutionDecision: vi.fn().mockReturnValue({
          shouldExecute: false,
          reason: 'cached',
        }),
      };
      vi.mocked(getGlobalTracker).mockReturnValue(tracker as never);

      const result = await executeLinter(mockLinter, { ...mockOptions, incremental: true });

      expect(appendToLog).toHaveBeenCalledWith(
        mockOptions.logDir,
        mockLinter.id,
        'SKIPPED (incremental): cached',
      );
      expect(result.status).toBe('SKIPPED');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'SKIPPED');
      expect(telemetryMock.recordExecution).toHaveBeenCalledWith(expect.anything(), 0, true);
    });

    it('continues when incremental tracker allows execution (line 80 true branch)', async () => {
      const { getGlobalTracker } = await import('./incremental.ts');
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        determineStatus,
      } = await import('./modules/index.ts');

      const tracker = {
        getExecutionDecision: vi.fn().mockReturnValue({
          shouldExecute: true,
        }),
      };
      vi.mocked(getGlobalTracker).mockReturnValue(tracker as never);

      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);
      vi.mocked(runProcess).mockResolvedValueOnce({ exitCode: 0, timedOut: false });
      vi.mocked(determineStatus).mockResolvedValueOnce('PASS');

      const result = await executeLinter(mockLinter, { ...mockOptions, incremental: true });

      expect(tracker.getExecutionDecision).toHaveBeenCalledWith('test-linter');
      expect(result.status).toBe('PASS');
    });

    it('records telemetry with success=false when status is not PASS/SKIPPED (line 136)', async () => {
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        determineStatus,
      } = await import('./modules/index.ts');

      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);
      vi.mocked(runProcess).mockResolvedValueOnce({ exitCode: 1, timedOut: false });
      vi.mocked(determineStatus).mockResolvedValueOnce('FAIL' as never);

      await executeLinter(mockLinter, mockOptions);

      expect(telemetryMock.recordExecution).toHaveBeenCalledWith(expect.anything(), 0, false);
    });

    it('records telemetry and rethrows on unexpected errors (lines 158-160)', async () => {
      const { getGlobalTracker } = await import('./incremental.ts');
      const boom = new Error('unexpected');
      vi.mocked(getGlobalTracker).mockImplementation(() => {
        throw boom;
      });

      await expect(executeLinter(mockLinter, { ...mockOptions, incremental: true })).rejects.toBe(
        boom,
      );
      expect(telemetryMock.recordExecution).toHaveBeenCalledWith(
        expect.anything(),
        0,
        false,
        'unexpected',
      );
    });

    it('executes process and returns status (line 103-112)', async () => {
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        determineStatus,
      } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);
      vi.mocked(runProcess).mockResolvedValueOnce({ exitCode: 0, timedOut: false });
      vi.mocked(determineStatus).mockResolvedValueOnce('PASS');

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('PASS');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'PASS');
    });

    it('handles transient error with retry (line 115-120)', async () => {
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        isTransientError,
        determineStatus,
      } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);

      // First attempt fails with transient error, second succeeds
      vi.mocked(runProcess)
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ exitCode: 0, timedOut: false });

      vi.mocked(isTransientError).mockReturnValue(true);
      vi.mocked(determineStatus).mockResolvedValueOnce('PASS');

      const result = await executeLinter(mockLinter, mockOptions, 1);

      expect(runProcess).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('PASS');
    });

    it('returns ERROR when all retries exhausted', async () => {
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        isTransientError,
      } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);

      // Mock runProcess to reject twice (first attempt + retry)
      vi.mocked(runProcess)
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'));

      vi.mocked(isTransientError).mockReturnValue(true);

      const result = await executeLinter(mockLinter, mockOptions, 1);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('ECONNRESET');
    });

    it('returns ERROR on non-transient error', async () => {
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        isTransientError,
      } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);
      vi.mocked(runProcess).mockRejectedValueOnce(new Error('EACCES'));
      vi.mocked(isTransientError).mockReturnValue(false);

      const result = await executeLinter(mockLinter, mockOptions, 1);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('EACCES');
    });

    it('handles unknown error types', async () => {
      const {
        shouldSkipLinter,
        checkBinaryExists,
        verifyLinterVersion,
        runProcess,
        isTransientError,
      } = await import('./modules/index.ts');
      vi.mocked(shouldSkipLinter).mockResolvedValueOnce({ skip: false });
      vi.mocked(checkBinaryExists).mockResolvedValueOnce(true);
      vi.mocked(verifyLinterVersion).mockResolvedValueOnce(null);
      vi.mocked(runProcess).mockRejectedValueOnce('string error');
      vi.mocked(isTransientError).mockReturnValue(false);

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('string error');
    });

    it('uses custom skipCheck when provided', async () => {
      const { shouldSkipLinter } = await import('./modules/index.ts');
      const customSkipCheck = vi.fn().mockResolvedValueOnce({ skip: true });
      const linterWithSkipCheck = { ...mockLinter, skipCheck: customSkipCheck };

      await executeLinter(linterWithSkipCheck, mockOptions);

      expect(customSkipCheck).toHaveBeenCalled();
      expect(shouldSkipLinter).not.toHaveBeenCalled();
    });

    it('exports executeLintersInParallel', async () => {
      const { executeLintersInParallel } = await import('./executor.ts');
      expect(typeof executeLintersInParallel).toBe('function');
    });
  });
});
