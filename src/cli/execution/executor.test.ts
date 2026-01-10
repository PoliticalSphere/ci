/**
 * Integration tests for executor module
 */

import { tmpdir } from 'node:os';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTrackerMock,
  getMockedIncremental,
  getMockedLogger,
  getMockedModules,
} from '../../__test-utils__/index.ts';
import { BinaryError } from '../../errors/errors.ts';
import { calculateSummary, executeLinter } from './executor.ts';

// Mock modules before importing executor functions that use them
vi.mock('../modules/index.ts', async () => {
  const actual = await vi.importActual<typeof import('../modules/index.ts')>('../modules/index.ts');
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

vi.mock('../observability/logger.ts', () => ({
  appendToLog: vi.fn().mockResolvedValue(undefined),
}));

const telemetryMock = {
  startExecution: vi.fn(() => ({})),
  recordExecution: vi.fn(),
};

vi.mock('../observability/telemetry.ts', () => ({
  getGlobalTelemetry: vi.fn(() => telemetryMock),
}));

vi.mock('../infrastructure/incremental.ts', () => ({
  getGlobalTracker: vi.fn(() => null),
}));

// Helper to set up a successful run path (reduce duplication)
async function setupPassRun(modsParam?: Awaited<ReturnType<typeof getMockedModules>>) {
  const mods = modsParam ?? (await getMockedModules());
  mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
  mods.checkBinaryExists.mockResolvedValueOnce(true);
  mods.verifyLinterVersion.mockResolvedValueOnce(null);
  mods.runProcess.mockResolvedValueOnce({ exitCode: 0, timedOut: false });
  mods.determineStatus.mockResolvedValueOnce('PASS');
  return mods;
}

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
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({
        skip: true,
        reason: 'No files found',
      });

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('SKIPPED');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'SKIPPED');
    });

    it('returns ERROR when binary does not exist (line 68-74)', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(false);

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('Binary not found');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('returns ERROR when version verification throws error (line 78-84)', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockRejectedValueOnce(
        new BinaryError('BINARY_VERSION_MISMATCH', 'Version mismatch'),
      );

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('BINARY_VERSION_MISMATCH');
      expect(result.error).toContain('Version mismatch');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('returns ERROR when version verification throws exception (line 85-91)', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockRejectedValueOnce(new Error('Version check failed'));

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('Version check failed');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('returns ERROR when version verification throws non-Error exception (line 83)', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockRejectedValueOnce('string error');

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('string error');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'ERROR');
    });

    it('skips when incremental tracker says no execution (lines 79-88)', async () => {
      const logger = await getMockedLogger();
      const incremental = await getMockedIncremental();

      const tracker = createTrackerMock(false, 'cached');
      incremental.getGlobalTracker.mockReturnValue(tracker as never);

      const result = await executeLinter(mockLinter, { ...mockOptions, incremental: true });

      expect(logger.appendToLog).toHaveBeenCalledWith(
        mockOptions.logDir,
        mockLinter.id,
        'SKIPPED (incremental): cached',
      );
      expect(result.status).toBe('SKIPPED');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'SKIPPED');
      expect(telemetryMock.recordExecution).toHaveBeenCalledWith(expect.anything(), 0, true);
    });

    it('continues when incremental tracker allows execution (line 80 true branch)', async () => {
      const incremental = await getMockedIncremental();
      const mods = await getMockedModules();

      const tracker = createTrackerMock(true);
      incremental.getGlobalTracker.mockReturnValue(tracker as never);

      await setupPassRun(mods);

      const result = await executeLinter(mockLinter, { ...mockOptions, incremental: true });

      expect(tracker.getExecutionDecision).toHaveBeenCalledWith('test-linter');
      expect(result.status).toBe('PASS');
    });

    it('records telemetry with success=false when status is not PASS/SKIPPED (line 136)', async () => {
      const mods = await getMockedModules();

      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockResolvedValueOnce(null);
      mods.runProcess.mockResolvedValueOnce({ exitCode: 1, timedOut: false });
      mods.determineStatus.mockResolvedValueOnce('FAIL' as never);

      await executeLinter(mockLinter, mockOptions);

      expect(telemetryMock.recordExecution).toHaveBeenCalledWith(expect.anything(), 0, false);
    });

    it('records telemetry and rethrows on unexpected errors (lines 158-160)', async () => {
      const incremental = await getMockedIncremental();
      const boom = new Error('unexpected');
      incremental.getGlobalTracker.mockImplementation(() => {
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
      const mods = await getMockedModules();
      await setupPassRun(mods);

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('PASS');
      expect(mockOptions.onStatusChange).toHaveBeenCalledWith('test-linter', 'PASS');
    });

    it('handles transient error with retry (line 115-120)', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockResolvedValueOnce(null);

      // First attempt fails with transient error, second succeeds
      mods.runProcess
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ exitCode: 0, timedOut: false });

      mods.isTransientError.mockReturnValue(true);
      mods.determineStatus.mockResolvedValueOnce('PASS');

      const result = await executeLinter(mockLinter, mockOptions, 1);

      expect(mods.runProcess).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('PASS');
    });

    it('returns ERROR when all retries exhausted', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockResolvedValueOnce(null);

      // Mock runProcess to reject twice (first attempt + retry)
      mods.runProcess
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'));

      mods.isTransientError.mockReturnValue(true);

      const result = await executeLinter(mockLinter, mockOptions, 1);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('ECONNRESET');
    });

    it('returns ERROR on non-transient error', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockResolvedValueOnce(null);
      mods.runProcess.mockRejectedValueOnce(new Error('EACCES'));
      mods.isTransientError.mockReturnValue(false);

      const result = await executeLinter(mockLinter, mockOptions, 1);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('EACCES');
    });

    it('handles unknown error types', async () => {
      const mods = await getMockedModules();
      mods.shouldSkipLinter.mockResolvedValueOnce({ skip: false });
      mods.checkBinaryExists.mockResolvedValueOnce(true);
      mods.verifyLinterVersion.mockResolvedValueOnce(null);
      mods.runProcess.mockRejectedValueOnce('string error');
      mods.isTransientError.mockReturnValue(false);

      const result = await executeLinter(mockLinter, mockOptions);

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('string error');
    });

    it('uses custom skipCheck when provided', async () => {
      const mods = await getMockedModules();
      const customSkipCheck = vi.fn().mockResolvedValueOnce({ skip: true });
      const linterWithSkipCheck = { ...mockLinter, skipCheck: customSkipCheck };

      await executeLinter(linterWithSkipCheck, mockOptions);

      expect(customSkipCheck).toHaveBeenCalled();
      expect(mods.shouldSkipLinter).not.toHaveBeenCalled();
    });

    it('exports executeLintersInParallel', async () => {
      const { executeLintersInParallel } = await import('./executor.ts');
      expect(typeof executeLintersInParallel).toBe('function');
    });
  });
});
