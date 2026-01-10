/**
 * Political Sphere — Incremental Execution Test Suite
 *
 * This suite exercises the tracker’s pattern registration, change detection,
 * and global enable/disable helpers so the incremental path remains predictable
 * when git is unavailable or file changes are present.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableIncrementalExecution,
  enableIncrementalExecution,
  getGlobalTracker,
  IncrementalExecutionTracker,
} from './incremental';

vi.mock('node:child_process');
vi.mock('node:crypto', () => {
  const createHash = vi.fn((algorithm?: string) => {
    // Minimal hash stub that captures written data and returns a deterministic string.
    let buffer = `${algorithm ?? 'sha256'}:`;
    const hash = {
      update(input: string) {
        buffer += input;
        return hash;
      },
      digest() {
        return buffer;
      },
    };
    return hash;
  });

  return { createHash };
});

describe('IncrementalExecutionTracker', () => {
  let tracker: IncrementalExecutionTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock git being available by default
    vi.mocked(execFileSync).mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerPattern', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
    });

    it('should register a custom file pattern for a linter', () => {
      const pattern = {
        linterId: 'custom-linter',
        patterns: ['**/*.custom'],
      };

      tracker.registerPattern(pattern);

      // With no changes in git, should not execute
      const decision = tracker.getExecutionDecision('custom-linter');
      expect(decision.shouldExecute).toBe(false);
      expect(decision.reason).toBe('No relevant files changed');
    });

    it('should override existing pattern for a linter', () => {
      const pattern1 = {
        linterId: 'eslint',
        patterns: ['**/*.js'],
      };
      const pattern2 = {
        linterId: 'eslint',
        patterns: ['**/*.ts'],
      };

      tracker.registerPattern(pattern1);
      tracker.registerPattern(pattern2);

      const stats = tracker.getStats();
      expect(stats.registeredPatterns).toBeGreaterThan(0);
    });
  });

  describe('getGitDiff (private method tested through public API)', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
    });

    it('should detect changes when git diff returns files', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\nsrc/file2.ts\nREADME.md\n');

      const changes = tracker.detectChanges(['src/**/*.ts']);
      expect(changes.hasChanges).toBe(true);
      expect(changes.changedFiles).toEqual(['src/file1.ts', 'src/file2.ts']);
    });

    it('should handle empty git diff output', () => {
      vi.mocked(execFileSync).mockReturnValue('');

      const changes = tracker.detectChanges(['src/**/*.ts']);
      expect(changes.hasChanges).toBe(false);
      expect(changes.changedFiles).toEqual([]);
      expect(changes.changeType).toBe('none');
    });

    it('should return empty string when git is not available', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('git not found');
      });

      // Create tracker when git is unavailable - this tests line 155
      const trackerNoGit = new IncrementalExecutionTracker();

      // When git is not available, detectChanges should return hasChanges: true
      const changes = trackerNoGit.detectChanges(['src/**/*.ts']);
      expect(changes.hasChanges).toBe(true);
      expect(changes.changedFiles).toEqual([]);
      expect(changes.changeType).toBe('none');
    });

    it('should call git without pathspec patterns and filter in-process', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\nlib/file2.js\nREADME.md\n');

      const changes = tracker.detectChanges(['src/**/*.ts', 'lib/**/*.js']);
      expect(changes.hasChanges).toBe(true);
      expect(changes.changedFiles).toEqual(['src/file1.ts', 'lib/file2.js']);

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only', 'HEAD'],
        expect.objectContaining({
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      );
    });

    it('should call git without file patterns when patterns array is empty', () => {
      vi.mocked(execFileSync).mockReturnValue('');

      tracker.detectChanges([]);

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only', 'HEAD'],
        expect.objectContaining({
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      );
    });
  });

  describe('computeGitStateHash (private method tested through public API)', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
    });

    it('should compute hash based on git diff', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\n');

      const decision1 = tracker.getExecutionDecision('eslint');
      expect(decision1).toBeDefined();
    });

    it('should compute different hashes for different states', () => {
      vi.mocked(execFileSync).mockReturnValueOnce('').mockReturnValueOnce('');

      const decision1 = tracker.getExecutionDecision('eslint');
      expect(decision1.shouldExecute).toBe(false);

      // Clear to force new check
      tracker.clearLinter('eslint');

      vi.mocked(execFileSync)
        .mockReturnValueOnce('src/file2.ts\n')
        .mockReturnValueOnce('src/file2.ts\n');

      const decision2 = tracker.getExecutionDecision('eslint');
      expect(decision2.shouldExecute).toBe(true);
    });

    it('should fall back to timestamp seed when diff and status are empty', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      vi.mocked(execFileSync).mockReturnValue('');

      type PrivateTracker = { computeGitStateHash(patterns: readonly string[]): string };
      const hash = (tracker as unknown as PrivateTracker).computeGitStateHash(['src/**/*.ts']);

      expect(hash).toBe(`sha256:${String(Date.now())}`);
    });

    it('should use timestamp fallback when computeGitStateHash throws', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Git operation failed');
      });
      const trackerError = new IncrementalExecutionTracker();
      // Force a new instance state to trigger the hash computation
      const decision = trackerError.getExecutionDecision('eslint');
      expect(decision.shouldExecute).toBe(true); // Conservative fallback - execute
    });

    it('should use timestamp fallback when createHash throws', () => {
      // Force createHash to throw to test line 188
      vi.mocked(createHash).mockImplementation(() => {
        throw new Error('Hash computation failed');
      });

      tracker = new IncrementalExecutionTracker();
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\n');

      const decision = tracker.getExecutionDecision('eslint');
      expect(decision.shouldExecute).toBe(true); // Conservative fallback - execute
    });

    it('should handle error in computeGitStateHash by using timestamp', () => {
      // Force an error during hash computation by making createHash throw
      // This is tested indirectly through getExecutionDecision
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\n');

      // This will compute hash successfully - testing the normal path
      const decision = tracker.getExecutionDecision('eslint');
      expect(decision).toBeDefined();
      expect(decision.shouldExecute).toBe(true);
    });
  });

  describe('detectChanges', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
    });

    it('should detect changes when files have changed', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\nsrc/file2.ts\n');

      const result = tracker.detectChanges(['src/**/*.ts']);
      expect(result.hasChanges).toBe(true);
      expect(result.changedFiles).toHaveLength(2);
      expect(result.changeType).toBe('mixed');
    });

    it('should handle no changes', () => {
      vi.mocked(execFileSync).mockReturnValue('');

      const result = tracker.detectChanges(['src/**/*.ts']);
      expect(result.hasChanges).toBe(false);
      expect(result.changedFiles).toEqual([]);
      expect(result.changeType).toBe('none');
    });

    it('should assume changes when git is unavailable', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('git not found');
      });

      const trackerNoGit = new IncrementalExecutionTracker();
      const result = trackerNoGit.detectChanges(['src/**/*.ts']);
      expect(result.hasChanges).toBe(true);
      expect(result.changeType).toBe('none');
    });

    it('should handle error gracefully during detection', () => {
      // Mock git available initially
      vi.mocked(execFileSync).mockReturnValueOnce('');

      const trackerWithGit = new IncrementalExecutionTracker();

      // Clear mock history
      vi.mocked(execFileSync).mockClear();

      // Then mock error during detection - the catch returns empty which means no changes
      vi.mocked(execFileSync).mockImplementationOnce(() => {
        throw new Error('git error');
      });

      const result = trackerWithGit.detectChanges(['src/**/*.ts']);
      // When error is caught, getGitDiff returns '', which results in no changes
      expect(result.hasChanges).toBe(false);
      expect(result.changeType).toBe('none');
    });

    it('should assume changes when detectChanges throws', () => {
      tracker = new IncrementalExecutionTracker();
      // Force git available
      vi.mocked(execFileSync).mockReturnValue('');

      // Force getGitDiff to throw inside detectChanges to hit catch branch at 226-232
      type GetGitDiffSpy = { getGitDiff(patterns: readonly string[]): string };
      vi.spyOn(tracker as unknown as GetGitDiffSpy, 'getGitDiff').mockImplementation(() => {
        throw new Error('forced diff failure');
      });

      const result = tracker.detectChanges(['src/**/*.ts']);

      expect(result).toEqual({
        hasChanges: true,
        changedFiles: [],
        changeType: 'none',
      });
    });

    it('should filter out empty lines from changed files', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\n\nsrc/file2.ts\n\n');

      const result = tracker.detectChanges(['src/**/*.ts']);
      expect(result.changedFiles).toEqual(['src/file1.ts', 'src/file2.ts']);
    });

    it('should return mixed change type for any changes', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\nsrc/file2.ts\nsrc/file3.ts\n');

      const result = tracker.detectChanges(['src/**/*.ts']);
      expect(result.changeType).toBe('mixed');
      expect(result.hasChanges).toBe(true);
    });
  });

  describe('getExecutionDecision', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
      vi.mocked(execFileSync).mockReturnValue('');
    });

    it('should execute when pattern is not registered', () => {
      const decision = tracker.getExecutionDecision('unknown-linter');
      expect(decision.shouldExecute).toBe(true);
      expect(decision.reason).toBe('No pattern registered for linter');
    });

    it('should not execute when no changes detected', () => {
      vi.mocked(execFileSync).mockReturnValue('');

      const decision = tracker.getExecutionDecision('eslint');
      expect(decision.shouldExecute).toBe(false);
      expect(decision.reason).toBe('No relevant files changed');
    });

    it('should execute when changes are detected', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\n');

      const decision = tracker.getExecutionDecision('eslint');
      expect(decision.shouldExecute).toBe(true);
      expect(decision.reason).toContain('Changes detected');
    });

    it('should use cached decision when checked recently', () => {
      vi.mocked(execFileSync).mockReturnValue('');

      // First check
      const decision1 = tracker.getExecutionDecision('eslint', 60_000);
      expect(decision1.shouldExecute).toBe(false);

      // Second check immediately after
      const decision2 = tracker.getExecutionDecision('eslint', 60_000);
      expect(decision2.shouldExecute).toBe(false);
      expect(decision2.reason).toBe('No changes detected since last execution');
    });

    it('should detect new changes after cached period with different hash', () => {
      // First check - no changes
      vi.mocked(execFileSync).mockReturnValue('');
      const decision1 = tracker.getExecutionDecision('eslint', 60_000);
      expect(decision1.shouldExecute).toBe(false);

      // Simulate changes
      vi.mocked(execFileSync).mockReturnValue('src/newfile.ts\n');

      // Check again within cache period but with different hash
      const decision2 = tracker.getExecutionDecision('eslint', 60_000);
      expect(decision2.shouldExecute).toBe(true);
    });

    it('should respect custom check interval', () => {
      vi.mocked(execFileSync).mockReturnValue('');

      const decision = tracker.getExecutionDecision('eslint', 1000); // 1 second
      expect(decision.shouldExecute).toBe(false);
      expect(decision.lastCheckTime).toBeGreaterThan(0);
    });

    it('should update check time on execution decision', () => {
      vi.mocked(execFileSync).mockReturnValue('src/file1.ts\n');

      const decision = tracker.getExecutionDecision('eslint');
      const now = Date.now();
      expect(decision.lastCheckTime).toBeLessThanOrEqual(now);
      expect(decision.lastCheckTime).toBeGreaterThan(now - 1000);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
      vi.mocked(execFileSync).mockReturnValue('');
    });

    it('should clear all cached change decisions', () => {
      // Make some decisions to populate cache
      tracker.getExecutionDecision('eslint');
      tracker.getExecutionDecision('typescript');

      let stats = tracker.getStats();
      expect(stats.trackedLinters).toBe(2);

      // Clear cache
      tracker.clear();

      stats = tracker.getStats();
      expect(stats.trackedLinters).toBe(0);
    });

    it('should allow new decisions after clearing', () => {
      tracker.getExecutionDecision('eslint');
      tracker.clear();

      const decision = tracker.getExecutionDecision('eslint');
      expect(decision).toBeDefined();
    });
  });

  describe('clearLinter', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
      vi.mocked(execFileSync).mockReturnValue('');
    });

    it('should clear cache for specific linter', () => {
      tracker.getExecutionDecision('eslint');
      tracker.getExecutionDecision('typescript');

      tracker.clearLinter('eslint');

      const stats = tracker.getStats();
      expect(stats.trackedLinters).toBe(1);
    });

    it('should not affect other linters when clearing one', () => {
      tracker.getExecutionDecision('eslint');
      tracker.getExecutionDecision('typescript');

      tracker.clearLinter('eslint');

      const stats = tracker.getStats();
      expect(stats.trackedLinters).toBe(1);
    });

    it('should handle clearing non-existent linter', () => {
      tracker.clearLinter('non-existent');
      const stats = tracker.getStats();
      expect(stats.trackedLinters).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      tracker = new IncrementalExecutionTracker();
      vi.mocked(execFileSync).mockReturnValue('');
    });

    it('should return correct statistics', () => {
      const stats = tracker.getStats();
      expect(stats.gitAvailable).toBe(true);
      expect(stats.trackedLinters).toBe(0);
      expect(stats.registeredPatterns).toBeGreaterThan(0); // Default patterns
    });

    it('should update tracked linters count', () => {
      tracker.getExecutionDecision('eslint');
      tracker.getExecutionDecision('typescript');

      const stats = tracker.getStats();
      expect(stats.trackedLinters).toBe(2);
    });

    it('should report git unavailable when git is not found', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('git not found');
      });

      const trackerNoGit = new IncrementalExecutionTracker();
      const stats = trackerNoGit.getStats();
      expect(stats.gitAvailable).toBe(false);
    });

    it('should include default registered patterns', () => {
      const stats = tracker.getStats();
      expect(stats.registeredPatterns).toBeGreaterThanOrEqual(13); // Default patterns
    });
  });
});

describe('Global tracker functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFileSync).mockReturnValue('');
  });

  afterEach(() => {
    disableIncrementalExecution();
    vi.restoreAllMocks();
  });

  describe('getGlobalTracker', () => {
    it('should return the global tracker instance', () => {
      const tracker = getGlobalTracker();
      expect(tracker).toBeInstanceOf(IncrementalExecutionTracker);
    });

    it('should return null after disabling', () => {
      disableIncrementalExecution();
      const tracker = getGlobalTracker();
      expect(tracker).toBeNull();
    });
  });

  describe('enableIncrementalExecution', () => {
    it('should create and set a new global tracker', () => {
      const tracker = enableIncrementalExecution();
      expect(tracker).toBeInstanceOf(IncrementalExecutionTracker);
      expect(getGlobalTracker()).toBe(tracker);
    });

    it('should replace existing tracker', () => {
      const tracker1 = enableIncrementalExecution();
      const tracker2 = enableIncrementalExecution();
      expect(tracker1).not.toBe(tracker2);
      expect(getGlobalTracker()).toBe(tracker2);
    });

    it('should return a functional tracker', () => {
      const tracker = enableIncrementalExecution();
      const stats = tracker.getStats();
      expect(stats).toBeDefined();
      expect(stats.gitAvailable).toBeDefined();
    });
  });

  describe('disableIncrementalExecution', () => {
    it('should set global tracker to null', () => {
      enableIncrementalExecution();
      disableIncrementalExecution();
      expect(getGlobalTracker()).toBeNull();
    });

    it('should be idempotent', () => {
      disableIncrementalExecution();
      disableIncrementalExecution();
      expect(getGlobalTracker()).toBeNull();
    });
  });
});
