/**
 * Tests for scripts/check-ci-status/check-ci-status.ts
 *
 * Validates the CI status aggregator script with 100% coverage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateArgs, main } from './check-ci-status.ts';

type JobStatus = 'success' | 'failure' | 'cancelled' | 'skipped';

type JobArgsOverrides = Partial<{
  secrets: JobStatus;
  pinning: JobStatus;
  biome: JobStatus;
  eslint: JobStatus;
  types: JobStatus;
  knip: JobStatus;
  duplication: JobStatus;
  tests: JobStatus;
  policy: JobStatus;
}>;

function makeJobArgs(overrides: JobArgsOverrides = {}): JobStatus[] {
  return [
    overrides.secrets ?? 'success',
    overrides.pinning ?? 'success',
    overrides.biome ?? 'success',
    overrides.eslint ?? 'success',
    overrides.types ?? 'success',
    overrides.knip ?? 'success',
    overrides.duplication ?? 'success',
    overrides.tests ?? 'success',
    overrides.policy ?? 'success',
  ];
}

describe('scripts/check-ci-status/check-ci-status.ts', () => {
  describe('Success cases', () => {
    it('should exit 0 when all jobs succeed', () => {
      const result = evaluateArgs(makeJobArgs());

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('✅ All CI checks passed!');
    });

    it('should display all job labels in output', () => {
      const result = evaluateArgs(makeJobArgs());

      expect(result.stdout).toContain('Secrets Detection: success');
      expect(result.stdout).toContain('Action Pinning: success');
      expect(result.stdout).toContain('Biome: success');
      expect(result.stdout).toContain('ESLint: success');
      expect(result.stdout).toContain('TypeScript: success');
      expect(result.stdout).toContain('knip: success');
      expect(result.stdout).toContain('Duplication: success');
      expect(result.stdout).toContain('Tests: success');
      expect(result.stdout).toContain('Policy: success');
    });

    it('should display section headers', () => {
      const result = evaluateArgs(makeJobArgs());

      expect(result.stdout).toContain('=== CI Results ===');
      expect(result.stdout).toContain('Trust Boundary Checks:');
      expect(result.stdout).toContain('Quality Checks:');
    });
  });

  describe('Trust boundary violations', () => {
    it('should exit 1 when secrets detection fails', () => {
      const result = evaluateArgs(makeJobArgs({ secrets: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Trust boundary violations detected!');
    });

    it('should exit 1 when action pinning fails', () => {
      const result = evaluateArgs(makeJobArgs({ pinning: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Trust boundary violations detected!');
    });

    it('should exit 1 when both trust boundary checks fail', () => {
      const result = evaluateArgs(makeJobArgs({ secrets: 'failure', pinning: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Trust boundary violations detected!');
    });

    it('should list failing trust checks with statuses', () => {
      const result = evaluateArgs(makeJobArgs({ secrets: 'cancelled', pinning: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Trust boundary violations detected!');
      expect(result.stdout).toContain('Failing trust checks:');
      expect(result.stdout).toContain('Secrets Detection: cancelled');
      expect(result.stdout).toContain('Action Pinning: failure');
    });
  });

  describe('Quality check failures', () => {
    it('should exit 1 when Biome fails', () => {
      const result = evaluateArgs(makeJobArgs({ biome: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when ESLint fails', () => {
      const result = evaluateArgs(makeJobArgs({ eslint: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when TypeScript fails', () => {
      const result = evaluateArgs(makeJobArgs({ types: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when knip fails', () => {
      const result = evaluateArgs(makeJobArgs({ knip: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when duplication check fails', () => {
      const result = evaluateArgs(makeJobArgs({ duplication: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when policy fails', () => {
      const result = evaluateArgs(makeJobArgs({ policy: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when tests fail', () => {
      const result = evaluateArgs(makeJobArgs({ tests: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 when multiple quality checks fail', () => {
      const result = evaluateArgs(makeJobArgs({ biome: 'failure', eslint: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should list failing quality checks with statuses', () => {
      const result = evaluateArgs(
        makeJobArgs({ biome: 'skipped', eslint: 'failure', knip: 'cancelled', policy: 'skipped' }),
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
      expect(result.stdout).toContain('Failing quality checks:');
      expect(result.stdout).toContain('Biome: skipped');
      expect(result.stdout).toContain('ESLint: failure');
      expect(result.stdout).toContain('knip: cancelled');
      expect(result.stdout).toContain('Policy: skipped');
    });
  });

  describe('Non-success status values', () => {
    it('should exit 1 for cancelled status', () => {
      const result = evaluateArgs(makeJobArgs({ biome: 'cancelled' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });

    it('should exit 1 for skipped status', () => {
      const result = evaluateArgs(makeJobArgs({ policy: 'skipped' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Quality checks failed!');
    });
  });

  describe('Error precedence', () => {
    it('should report trust boundary violations before quality failures', () => {
      const result = evaluateArgs(makeJobArgs({ secrets: 'failure', biome: 'failure' }));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Trust boundary violations detected!');
      expect(result.stdout).not.toContain('❌ Quality checks failed!');
    });

    it('should report trust boundary violations even when all jobs fail', () => {
      const result = evaluateArgs([
        'failure',
        'failure',
        'failure',
        'failure',
        'failure',
        'failure',
        'failure',
        'failure',
        'failure',
      ]);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('❌ Trust boundary violations detected!');
      expect(result.stdout).not.toContain('❌ Quality checks failed!');
    });
  });

  describe('Argument validation', () => {
    it('should exit 1 with usage message when no arguments provided', () => {
      const result = evaluateArgs([]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage:');
    });

    it('should exit 1 with usage message when too few arguments provided', () => {
      const result = evaluateArgs(['success', 'success', 'success']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage:');
    });

    it('should exit 1 with usage message when too many arguments provided', () => {
      const result = evaluateArgs([
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'extra',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage:');
    });
  });

  describe('Help and debug flags', () => {
    it('should print usage and exit 0 with --help', () => {
      const result = evaluateArgs(['--help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:');
    });

    it('should print usage and exit 0 with -h', () => {
      const result = evaluateArgs(['-h']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:');
    });

    it('should enable tracing with --debug and still exit 0', () => {
      const result = evaluateArgs(['--debug', ...makeJobArgs()]);
      expect(result.code).toBe(0);
      expect(result.stderr).toContain('printf');
    });

    it('should enable tracing when debug option is passed', () => {
      const result = evaluateArgs(makeJobArgs(), { debug: true });
      expect(result.code).toBe(0);
      expect(result.stderr).toContain('printf');
    });
  });

  describe('main function', () => {
    const originalArgv = process.argv;
    const originalEnv = process.env;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.exitCode = undefined;
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.env = originalEnv;
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      process.exitCode = undefined;
    });

    it('should set exitCode to 0 when all jobs succeed', () => {
      process.argv = ['node', 'check-ci-status.ts', ...makeJobArgs()];

      main();

      expect(process.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should set exitCode to 1 when jobs fail', () => {
      process.argv = ['node', 'check-ci-status.ts', ...makeJobArgs({ secrets: 'failure' })];

      main();

      expect(process.exitCode).toBe(1);
    });

    it('should output to stderr when there are errors', () => {
      process.argv = ['node', 'check-ci-status.ts'];

      main();

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should enable debug when CHECK_CI_STATUS_DEBUG=1', () => {
      process.argv = ['node', 'check-ci-status.ts', ...makeJobArgs()];
      process.env = { ...process.env, CHECK_CI_STATUS_DEBUG: '1' };

      main();

      expect(process.exitCode).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should enable debug when CHECK_CI_STATUS_DEBUG=true', () => {
      process.argv = ['node', 'check-ci-status.ts', ...makeJobArgs()];
      process.env = { ...process.env, CHECK_CI_STATUS_DEBUG: 'true' };

      main();

      expect(process.exitCode).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
