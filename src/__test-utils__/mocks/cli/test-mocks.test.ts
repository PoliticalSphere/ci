/**
 * Political Sphere — Mock Factories Tests
 *
 * Verifies:
 *   - getMockedModules() returns all required mocked functions
 *   - getMockedLogger() returns mocked logger functions
 *   - getMockedIncremental() returns mocked incremental functions
 *   - createTrackerMock() creates functional tracker mocks
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createTrackerMock,
  getMockedIncremental,
  getMockedLogger,
  getMockedModules,
} from '../../index.ts';

describe('test-mocks', () => {
  it('getMockedModules returns all required mocked functions', async () => {
    const mocks = await getMockedModules();

    expect(mocks.shouldSkipLinter).toBeDefined();
    expect(typeof mocks.shouldSkipLinter).toBe('function');

    expect(mocks.checkBinaryExists).toBeDefined();
    expect(typeof mocks.checkBinaryExists).toBe('function');

    expect(mocks.verifyLinterVersion).toBeDefined();
    expect(typeof mocks.verifyLinterVersion).toBe('function');

    expect(mocks.runProcess).toBeDefined();
    expect(typeof mocks.runProcess).toBe('function');

    expect(mocks.determineStatus).toBeDefined();
    expect(typeof mocks.determineStatus).toBe('function');

    expect(mocks.detectKnipFindings).toBeDefined();
    expect(typeof mocks.detectKnipFindings).toBe('function');

    expect(mocks.isTransientError).toBeDefined();
    expect(typeof mocks.isTransientError).toBe('function');
  });

  it('getMockedModules returns object with all expected keys', async () => {
    const mocks = await getMockedModules();
    const keys = Object.keys(mocks);

    expect(keys).toContain('shouldSkipLinter');
    expect(keys).toContain('checkBinaryExists');
    expect(keys).toContain('verifyLinterVersion');
    expect(keys).toContain('runProcess');
    expect(keys).toContain('determineStatus');
    expect(keys).toContain('detectKnipFindings');
    expect(keys).toContain('isTransientError');
    expect(keys).toHaveLength(7);
  });

  it('getMockedLogger returns mocked logger functions', async () => {
    const logger = await getMockedLogger();

    expect(logger.appendToLog).toBeDefined();
    expect(typeof logger.appendToLog).toBe('function');
  });

  it('getMockedLogger returns object with appendToLog key', async () => {
    const logger = await getMockedLogger();
    const keys = Object.keys(logger);

    expect(keys).toContain('appendToLog');
    expect(keys).toHaveLength(1);
  });

  it('getMockedIncremental returns mocked incremental tracker functions', async () => {
    const incremental = await getMockedIncremental();

    expect(incremental.getGlobalTracker).toBeDefined();
    expect(typeof incremental.getGlobalTracker).toBe('function');
  });

  it('getMockedIncremental returns object with getGlobalTracker key', async () => {
    const incremental = await getMockedIncremental();
    const keys = Object.keys(incremental);

    expect(keys).toContain('getGlobalTracker');
    expect(keys).toHaveLength(1);
  });

  it('getMockedIncremental falls back to canonical import when no mock matches', async () => {
    const importSpy = vi.spyOn(vi, 'importMock').mockRejectedValue(new Error('no mock'));

    const incremental = await getMockedIncremental();

    expect(importSpy).toHaveBeenCalled();
    expect(incremental.getGlobalTracker).toBeDefined();
    expect(typeof incremental.getGlobalTracker).toBe('function');

    importSpy.mockRestore();
  });

  it('createTrackerMock creates a tracker with shouldExecute=true', () => {
    const tracker = createTrackerMock(true, 'reason1');

    const decision = tracker.getExecutionDecision('eslint');
    expect(decision.shouldExecute).toBe(true);
    expect(decision.reason).toBe('reason1');
    expect(tracker.getExecutionDecision).toHaveBeenCalledWith('eslint');
  });

  it('createTrackerMock creates a tracker with shouldExecute=false', () => {
    const tracker = createTrackerMock(false, 'skipped');

    const decision = tracker.getExecutionDecision('prettier');
    expect(decision.shouldExecute).toBe(false);
    expect(decision.reason).toBe('skipped');
  });

  it('createTrackerMock defaults reason to empty string when not provided', () => {
    const tracker = createTrackerMock(true);

    const decision = tracker.getExecutionDecision('biome');
    expect(decision.reason).toBe('');
    expect(decision.shouldExecute).toBe(true);
  });

  it('createTrackerMock returns a mock that can be called multiple times', () => {
    const tracker = createTrackerMock(true, 'cached');

    const decision1 = tracker.getExecutionDecision('eslint');
    const decision2 = tracker.getExecutionDecision('prettier');

    expect(decision1.shouldExecute).toBe(true);
    expect(decision2.shouldExecute).toBe(true);
    expect(decision1.reason).toBe('cached');
    expect(decision2.reason).toBe('cached');
    expect(tracker.getExecutionDecision).toHaveBeenCalledTimes(2);
  });

  it('createTrackerMock getExecutionDecision returns correct structure', () => {
    const tracker = createTrackerMock(false, 'test reason');

    const result = tracker.getExecutionDecision('test-linter');

    expect(result).toHaveProperty('shouldExecute');
    expect(result).toHaveProperty('reason');
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('createTrackerMock can be used with different linter IDs', () => {
    const tracker = createTrackerMock(true, 'all pass');

    tracker.getExecutionDecision('eslint');
    tracker.getExecutionDecision('prettier');
    tracker.getExecutionDecision('biome');

    expect(tracker.getExecutionDecision).toHaveBeenCalledTimes(3);
    expect(tracker.getExecutionDecision).toHaveBeenCalledWith('eslint');
    expect(tracker.getExecutionDecision).toHaveBeenCalledWith('prettier');
    expect(tracker.getExecutionDecision).toHaveBeenCalledWith('biome');
  });

  it('getMockedModules can be called multiple times independently', async () => {
    const mocks1 = await getMockedModules();
    const mocks2 = await getMockedModules();

    // Should get separate mock instances
    expect(mocks1).toBeDefined();
    expect(mocks2).toBeDefined();
    expect(mocks1.shouldSkipLinter).toBeDefined();
    expect(mocks2.shouldSkipLinter).toBeDefined();
  });

  it('getMockedLogger can be called multiple times independently', async () => {
    const logger1 = await getMockedLogger();
    const logger2 = await getMockedLogger();

    expect(logger1).toBeDefined();
    expect(logger2).toBeDefined();
    expect(logger1.appendToLog).toBeDefined();
    expect(logger2.appendToLog).toBeDefined();
  });

  it('getMockedIncremental can be called multiple times independently', async () => {
    const incremental1 = await getMockedIncremental();
    const incremental2 = await getMockedIncremental();

    expect(incremental1).toBeDefined();
    expect(incremental2).toBeDefined();
    expect(incremental1.getGlobalTracker).toBeDefined();
    expect(incremental2.getGlobalTracker).toBeDefined();
  });
});
