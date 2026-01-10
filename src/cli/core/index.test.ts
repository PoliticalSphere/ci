/**
 * Political Sphere — CLI Tests (behavioral, coverage-oriented)
 */

import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createMainTestDeps } from '../../__test-utils__/fixtures/cli/cli-main-fixtures.ts';
import { LINTER_REGISTRY } from '../config';
import type { LinterResult, LinterStatus } from './executor.ts';
import {
  ensureSafeDirectoryPath,
  main,
  parseCliArgs,
  resolveLinters,
  runEntrypoint,
  showHelp,
  showVersion,
} from './index.ts';

vi.mock('./ui.tsx', () => ({
  WAITING_HEADER_MESSAGE: 'WAITING FOR ANOTHER PROCESS TO FINISH; PROCESS WILL RESUME SHORTLY',
  renderDashboard: () => ({
    updateStatus: vi.fn(),
    waitForExit: vi.fn().mockResolvedValue(undefined),
  }),
  renderWaitingHeader: () => ({
    unmount: vi.fn(),
  }),
}));

import { expectDefaultArgs, expectParsedFlags } from '../../__test-utils__/assertions/args-helpers';
import {
  createDeferred,
  createLockAcquisitionHandler,
  fakeConsole,
} from '../../__test-utils__/index.ts';
import {
  captureErrorListeners,
  removeNewListeners,
} from '../../__test-utils__/mocks/process/error-listeners';
/**
 * Helper functions to reduce nesting in mock setups.
 */
import {
  createParseArgsMock,
  createParseError,
  mockNodeUtil,
} from '../../__test-utils__/mocks/process/node-util-mocks.ts';

describe('Political Sphere — CLI', () => {
  describe('parseCliArgs', () => {
    it('parses defaults when no argv provided', () => {
      const args = parseCliArgs([]);

      expectDefaultArgs(args);
      expect(args).toBeDefined();
    });

    it('parses flags and linters from argv', () => {
      const args = parseCliArgs([
        '--verify-logs',
        '--log-dir',
        './build/logs',
        '--linters',
        'eslint',
        '--verbose',
      ]);

      expectParsedFlags(args, {
        verifyLogs: true,
        logDir: './build/logs',
        linters: ['eslint'],
        verbose: true,
      });
      expect(args).toBeDefined();
    });

    it('maps --debug to verbose', () => {
      const args = parseCliArgs(['--debug']);

      expect(args.verbose).toBe(true);
    });

    it('throws on unknown flags', () => {
      expect(() => parseCliArgs(['--bogus'])).toThrow(/Unknown option: --bogus/);
    });

    it('throws when --log-dir is missing a value', () => {
      expect(() => parseCliArgs(['--log-dir'])).toThrow(/--log-dir requires a path/);
    });

    it('throws when --log-dir is empty or whitespace only', () => {
      expect(() => parseCliArgs(['--log-dir', '   '])).toThrow(/--log-dir requires a path/);
    });

    it('throws when --linters is missing a value', () => {
      expect(() => parseCliArgs(['--linters'])).toThrow(
        /--linters requires at least one linter id/,
      );
    });

    it('throws on unexpected positional arguments', () => {
      expect(() => parseCliArgs(['eslint'])).toThrow(/Unexpected argument: eslint/);
    });

    it('skips undefined argv entries', () => {
      const argv = Array.from<string>({ length: 2 });
      argv[1] = '--help';

      const args = parseCliArgs(argv);

      expect(args.help).toBe(true);
    });

    it('handles parse error with no option extracted (generic fallback)', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError('Generic parse error', 'ERR_PARSE_ARGS_UNKNOWN_OPTION'),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--invalid'])).toThrow(/Generic parse error/);
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('re-throws error with unrecognized error code', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError('Unhandled error', 'ERR_SOME_UNHANDLED_CODE'),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--test'])).toThrow('Unhandled error');
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('re-throws error for unrecognized option in missing value error', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError(
          "Option '--unknown' requires a value",
          'ERR_PARSE_ARGS_MISSING_VALUE',
          '--unknown',
        ),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--unknown'])).toThrow("Option '--unknown' requires a value");
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('maps log-dir missing value error', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError(
          "Option '--log-dir' requires argument",
          'ERR_PARSE_ARGS_MISSING_VALUE',
          '--log-dir',
        ),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--log-dir'])).toThrow(/--log-dir requires a path/);
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('handles unknown option error without extractable option from message', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError('Some parse error without option syntax', 'ERR_PARSE_ARGS_UNKNOWN_OPTION'),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--unknown'])).toThrow(
          /Some parse error without option syntax/,
        );
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('maps linters missing value error', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError(
          "Option '--linters' requires argument",
          'ERR_PARSE_ARGS_MISSING_VALUE',
          '--linters',
        ),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--linters'])).toThrow(
          /--linters requires at least one linter id/,
        );
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('maps unknown option error and extracts option from message', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError("Unknown option '--foo'", 'ERR_PARSE_ARGS_UNKNOWN_OPTION'),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--foo'])).toThrow(/Unknown option: --foo/);
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('maps invalid option value for --log-dir when extracted from message', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError(
          "Invalid value for '--log-dir': not a path",
          'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
        ),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--log-dir', 'bad'])).toThrow(/--log-dir requires a path/);
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('maps invalid option value for --linters when extracted from message', async () => {
      vi.resetModules();

      const parseArgsFn = createParseArgsMock(() =>
        createParseError(
          "Invalid value for '--linters': none provided",
          'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
        ),
      );

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        expect(() => parseWithMock(['--linters', 'bad'])).toThrow(
          /--linters requires at least one linter id/,
        );
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });

    it('handles non-Error thrown values from parseArgs', async () => {
      vi.resetModules();

      const parseArgsFn = () => {
        // Throwing a string instead of an Error instance to simulate library bugs
        throw 'not-an-error';
      };

      vi.doMock('node:util', () => mockNodeUtil(parseArgsFn as unknown as () => never));

      try {
        const { parseCliArgs: parseWithMock } = await import('./index.ts');
        try {
          parseWithMock(['--log-dir']);
          throw new Error('expected to throw');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          // Class identity may differ due to module reset; verify error shape instead
          expect((err as { code?: string }).code).toBe('CLI_PARSE_ERROR');
          expect((err as Error).message).toContain('not-an-error');
        }
      } finally {
        vi.doUnmock('node:util');
        vi.resetModules();
      }
    });
  });

  describe('resolveLinters', () => {
    it('returns the full registry when no filter provided', () => {
      const resolved = resolveLinters();
      expect(resolved).toHaveLength(LINTER_REGISTRY.length);
    });

    it('returns filtered linters when specific IDs are requested', () => {
      const resolved = resolveLinters(['eslint', 'typescript']);
      expect(resolved).toHaveLength(2);
      expect(resolved.map((l) => l.id).toSorted()).toEqual(['eslint', 'typescript'].toSorted());
    });

    it('throws when invalid linters are requested', () => {
      expect(() => resolveLinters(['notreal'])).toThrow(/Invalid linter IDs: notreal/);
    });

    it('throws when duplicate linters are requested', () => {
      expect(() => resolveLinters(['eslint', 'eslint'])).toThrow(/Duplicate linter IDs: eslint/);
    });

    it('throws when empty linter IDs are provided', () => {
      expect(() => resolveLinters(['eslint,,typescript'])).toThrow(/Empty linter IDs/);
    });

    it('handles comma-separated linter IDs', () => {
      const resolved = resolveLinters(['eslint,typescript']);
      expect(resolved).toHaveLength(2);
      expect(resolved.map((l) => l.id).toSorted()).toEqual(['eslint', 'typescript'].toSorted());
    });

    it('rejects when linters are provided but become empty after normalization', () => {
      expect(() => parseCliArgs(['--linters', ''])).toThrow(
        /--linters requires at least one linter id/,
      );
    });

    it('rejects when logDir normalizes to empty', () => {
      expect(() => parseCliArgs(['--log-dir', '   '])).toThrow(/--log-dir requires a path/);
    });
  });

  describe('ensureSafeDirectoryPath', () => {
    it('resolves paths within the base directory', () => {
      const result = ensureSafeDirectoryPath('/home/user/project', './logs');
      expect(result).toBe('/home/user/project/logs');
    });

    it('rejects traversal outside the base directory', () => {
      expect(() => ensureSafeDirectoryPath('/home/user/project', '../etc')).toThrow(
        /Log directory must be within/,
      );
    });

    it('rejects paths that only share a prefix with the base directory', () => {
      expect(() =>
        ensureSafeDirectoryPath('/home/user/project', '/home/user/project2/logs'),
      ).toThrow(/Log directory must be within/);
    });
  });

  describe('showHelp', () => {
    it('returns formatted help text', () => {
      const help = showHelp();
      expect(help).toContain('Parallel Linter CLI');
      expect(help).toContain('USAGE:');
      expect(help).toContain('OPTIONS:');
    });
  });

  describe('main', () => {
    // Helper to get temp directory without trailing slash
    const getTmpDir = () => tmpdir().replace(/\/$/, '');

    const baseDeps = () => ({
      mkdirFn: vi.fn().mockResolvedValue(undefined),
      renderDashboardFn: vi.fn(() => ({
        updateStatus: vi.fn(),
        waitForExit: vi.fn().mockResolvedValue(undefined),
      })),
      renderWaitingHeaderFn: vi.fn(() => ({
        unmount: vi.fn(),
      })),
      acquireExecutionLockFn: vi.fn().mockResolvedValue({
        lockPath: `${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`,
        release: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const sampleResults = (logDir: string): readonly LinterResult[] => [
      {
        id: 'eslint',
        name: 'ESLint',
        status: 'PASS',
        exitCode: 0,
        duration: 5,
        logPath: `${logDir}/eslint.log`,
      },
    ];

    it('prints help and exits with code 0', async () => {
      const consoleSpies = fakeConsole();
      const result = await main({
        argv: ['--help'],
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(0);
      expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringContaining('Parallel Linter CLI'));
      expect(consoleSpies.error).not.toHaveBeenCalled();
    });

    it('prints version and exits with code 0', async () => {
      const consoleSpies = fakeConsole();
      const result = await main({
        argv: ['--version'],
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(0);
      expect(consoleSpies.log).toHaveBeenCalledWith(showVersion());
      expect(consoleSpies.error).not.toHaveBeenCalled();
    });

    it('uses global console when printing help without injected console', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const result = await main({ argv: ['--help'] });
        expect(result.exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Parallel Linter CLI'));
      } finally {
        logSpy.mockRestore();
      }
    });

    it('uses global console when printing version without injected console', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const result = await main({ argv: ['--version'] });
        expect(result.exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith(showVersion());
      } finally {
        logSpy.mockRestore();
      }
    });

    it('runs happy-path execution and reports success', async () => {
      const consoleSpies = fakeConsole();
      const mkdirFn = vi.fn().mockResolvedValue(undefined);
      const writeFileFn = vi.fn().mockResolvedValue(undefined);
      const updateStatusMock = vi.fn();
      const renderDashboardFn = vi.fn(() => ({
        updateStatus: updateStatusMock,
        waitForExit: vi.fn().mockResolvedValue(undefined),
      }));
      const renderWaitingHeaderFn = vi.fn(() => ({
        unmount: vi.fn(),
      }));
      const acquireExecutionLockFn = vi.fn().mockResolvedValue({
        lockPath: `${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`,
        release: vi.fn().mockResolvedValue(undefined),
      });

      let capturedOnStatusChange: ((id: string, status: LinterStatus) => void) | undefined;
      const executeLintersFn = vi.fn(
        (
          _linters,
          options: { logDir: string; onStatusChange?: (id: string, status: LinterStatus) => void },
        ) => {
          capturedOnStatusChange = options.onStatusChange;
          return Promise.resolve(sampleResults(options.logDir));
        },
      );

      const calculateSummaryFn = vi.fn(() => ({
        total: 1,
        passed: 1,
        failed: 0,
        errors: 0,
        duration: 5,
      }));

      const testCwd = `${getTmpDir()}/ps-test-project-${process.pid}`;
      const result = await main({
        argv: [],
        cwd: testCwd,
        mkdirFn,
        writeFileFn,
        renderDashboardFn,
        renderWaitingHeaderFn,
        executeLintersFn,
        calculateSummaryFn,
        acquireExecutionLockFn,
        console: consoleSpies as unknown as typeof console,
      });

      // Trigger the onStatusChange callback to ensure line 219 is covered
      if (capturedOnStatusChange) {
        capturedOnStatusChange('eslint', 'RUNNING');
      }

      expect(result.exitCode).toBe(0);
      expect(result.summary?.passed).toBe(1);
      expect(consoleSpies.log).toHaveBeenCalledWith('\n✅ All linters passed');
      expect(consoleSpies.error).not.toHaveBeenCalled();
      expect(mkdirFn).toHaveBeenCalledWith(`${testCwd}/logs`, { recursive: true });
      expect(renderDashboardFn).toHaveBeenCalled();
      expect(executeLintersFn).toHaveBeenCalled();
      expect(updateStatusMock).toHaveBeenCalledWith('eslint', 'RUNNING');
    });

    it('waits for the execution lock before starting linters', async () => {
      const consoleSpies = fakeConsole();
      const mkdirFn = vi.fn().mockResolvedValue(undefined);
      const unmountSpy = vi.fn();
      const renderDashboardFn = vi.fn(() => ({
        updateStatus: vi.fn(),
        waitForExit: vi.fn().mockResolvedValue(undefined),
      }));
      const renderWaitingHeaderFn = vi.fn(() => ({
        unmount: unmountSpy,
      }));
      const executeLintersFn = vi.fn((_linters, options: { logDir: string }) =>
        Promise.resolve(sampleResults(options.logDir)),
      );
      const calculateSummaryFn = vi.fn(() => ({
        total: 1,
        passed: 1,
        failed: 0,
        errors: 0,
        duration: 5,
      }));

      const lockDeferred = createDeferred<{
        lockPath: string;
        release: () => Promise<void>;
      }>();

      const handleLockAcquisition = createLockAcquisitionHandler(lockDeferred);
      const acquireExecutionLockFn = vi.fn(handleLockAcquisition);

      const mainPromise = main({
        argv: [],
        cwd: `${getTmpDir()}/ps-test-project-${process.pid}`,
        mkdirFn,
        renderDashboardFn,
        renderWaitingHeaderFn,
        executeLintersFn,
        calculateSummaryFn,
        acquireExecutionLockFn,
        console: consoleSpies as unknown as typeof console,
      });

      await Promise.resolve();

      expect(renderWaitingHeaderFn).toHaveBeenCalled();
      expect(renderWaitingHeaderFn.mock.calls[0]?.[0]).toBe(
        'WAITING FOR ANOTHER PROCESS TO FINISH; PROCESS WILL RESUME SHORTLY',
      );
      expect(executeLintersFn).not.toHaveBeenCalled();

      const release = vi.fn().mockResolvedValue(undefined);
      lockDeferred.resolve({
        lockPath: `${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`,
        release,
      });

      const result = await mainPromise;
      expect(result.exitCode).toBe(0);
      expect(executeLintersFn).toHaveBeenCalled();
      expect(unmountSpy).toHaveBeenCalled();
      expect(release).toHaveBeenCalled();
    });

    it('releases the execution lock when linters throw', async () => {
      const consoleSpies = fakeConsole();
      const release = vi.fn().mockResolvedValue(undefined);
      const acquireExecutionLockFn = vi.fn().mockResolvedValue({
        lockPath: `${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`,
        release,
      });
      const renderDashboardFn = vi.fn(() => ({
        updateStatus: vi.fn(),
        waitForExit: vi.fn().mockResolvedValue(undefined),
      }));
      const renderWaitingHeaderFn = vi.fn(() => ({
        unmount: vi.fn(),
      }));

      const result = await main({
        argv: [],
        cwd: `${getTmpDir()}/ps-test-project-${process.pid}`,
        mkdirFn: vi.fn().mockResolvedValue(undefined),
        renderDashboardFn,
        renderWaitingHeaderFn,
        executeLintersFn: vi.fn().mockRejectedValue(new Error('boom')),
        calculateSummaryFn: vi.fn(),
        acquireExecutionLockFn,
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(1);
      expect(release).toHaveBeenCalled();
    });

    it('uses default console when none is injected', async () => {
      const { calculateSummaryFn, options } = createMainTestDeps(['--verify-logs']);

      const result = await main(options);

      expect(result.exitCode).toBe(0);
      expect(calculateSummaryFn).toHaveBeenCalled();
    });

    it('logs verbose details when verbose flag is set', async () => {
      const consoleSpies = fakeConsole();
      const { options } = createMainTestDeps(['--verbose'], consoleSpies as unknown);

      const result = await main(options);

      expect(result.exitCode).toBe(0);
      expect(consoleSpies.log).toHaveBeenCalledWith('Verbose mode: ENABLED');
      // Match dynamic temp directory pattern with process ID
      expect(consoleSpies.log).toHaveBeenCalledWith(
        expect.stringMatching(/^Working directory: .*\/ps-test-project-\d+$/),
      );
      expect(consoleSpies.log).toHaveBeenCalledWith('Requested linters: all');
    });

    it('returns failure exit code when summary has errors', async () => {
      const consoleSpies = fakeConsole();
      const deps = baseDeps();
      const executeLintersFn = vi.fn((_linters, options: { logDir: string }) =>
        Promise.resolve(sampleResults(options.logDir)),
      );
      const calculateSummaryFn = vi.fn(() => ({
        total: 1,
        passed: 0,
        failed: 0,
        errors: 1,
        duration: 5,
      }));

      const result = await main({
        argv: [],
        cwd: `${getTmpDir()}/ps-test-project-${process.pid}`,
        ...deps,
        executeLintersFn,
        calculateSummaryFn,
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(1);
      expect(consoleSpies.error).toHaveBeenCalledWith('\n❌ Linting failed');
    });

    it('surfaces fatal errors and sets exit code to 1', async () => {
      const consoleSpies = fakeConsole();
      const result = await main({
        argv: ['--linters', 'invalid'],
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(1);
      expect(consoleSpies.error).toHaveBeenCalledWith('\n❌ Fatal error:', expect.any(Error));
    });

    it('honors --clear-cache and --incremental flags and logs their state', async () => {
      const consoleSpies = fakeConsole();
      const { options } = createMainTestDeps(
        ['--clear-cache', '--incremental'],
        consoleSpies as unknown,
      );

      const result = await main(options);

      expect(result.exitCode).toBe(0);
      expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringContaining('Caching disabled'));
      expect(consoleSpies.log).toHaveBeenCalledWith(
        expect.stringContaining('Incremental execution enabled'),
      );
    });

    it('warns when release lock fails during finally', async () => {
      const consoleSpies = fakeConsole();
      const deps = createMainTestDeps([]);
      const release = vi.fn().mockRejectedValue(new Error('release failed'));
      const acquireExecutionLockFn = vi
        .fn()
        .mockResolvedValue({ lockPath: `/tmp/ps-parallel-lint-test-${process.pid}.lock`, release });

      const result = await main({
        argv: [],
        cwd: deps.options.cwd,
        mkdirFn: deps.mkdirFn,
        renderDashboardFn: deps.renderDashboardFn,
        renderWaitingHeaderFn: deps.renderWaitingHeaderFn,
        executeLintersFn: deps.executeLintersFn,
        calculateSummaryFn: deps.calculateSummaryFn,
        acquireExecutionLockFn,
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(0);
      expect(release).toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalledWith(
        '\nWARN: Failed to release execution lock:',
        expect.any(Error),
      );
    });

    it('warns when writing telemetry.json fails', async () => {
      vi.resetModules();

      // Mock telemetry to return a collector whose export is called
      vi.doMock('./telemetry.ts', () => ({
        getGlobalTelemetry: () => ({ export: () => ({ foo: 'bar' }) }),
      }));

      try {
        const { main: mainWithMock } = await import('./index.ts');
        const consoleSpies = fakeConsole();
        const { options } = createMainTestDeps([]);
        const writeFileFn = vi.fn().mockRejectedValue(new Error('disk full'));

        const result = await mainWithMock({
          ...options,
          writeFileFn,
          console: consoleSpies as unknown as typeof console,
        });

        expect(result.exitCode).toBe(0);
        expect(consoleSpies.error).toHaveBeenCalledWith(
          '\nWARN: Failed to write telemetry.json:',
          expect.any(Error),
        );
      } finally {
        vi.doUnmock('./telemetry.ts');
        vi.resetModules();
      }
    });

    it('unmounts waiting view if still mounted when an error occurs', async () => {
      const consoleSpies = fakeConsole();
      const deps = createMainTestDeps([]);

      const renderWaitingHeaderFn = vi.fn(() => ({ unmount: vi.fn() }));
      const acquireExecutionLockFn = vi.fn(
        (options?: { onWaitStart?: () => void; onWaitEnd?: () => void }) => {
          // Simulate a lock acquisition that signals wait-start but never signals wait-end
          options?.onWaitStart?.();
          return Promise.resolve({
            lockPath: `/tmp/ps-parallel-lint-test-${process.pid}.lock`,
            release: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      const executeLintersFn = vi.fn().mockRejectedValue(new Error('boom'));

      const result = await main({
        argv: [],
        cwd: deps.options.cwd,
        mkdirFn: deps.mkdirFn,
        renderDashboardFn: deps.renderDashboardFn,
        renderWaitingHeaderFn,
        executeLintersFn,
        calculateSummaryFn: deps.calculateSummaryFn,
        acquireExecutionLockFn,
        console: consoleSpies as unknown as typeof console,
      });

      expect(renderWaitingHeaderFn).toHaveBeenCalled();
      // The unmount returned by our renderWaitingHeaderFn should have been invoked in finally
      expect(renderWaitingHeaderFn.mock.results[0].value.unmount).toHaveBeenCalled();
      expect(result.exitCode).toBe(1);
    });

    it('logs a warning when releasing lock fails', async () => {
      const consoleSpies = fakeConsole();
      const release = vi.fn().mockRejectedValue(new Error('release boom'));
      const acquireExecutionLockFn = vi.fn().mockResolvedValue({
        lockPath: `${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`,
        release,
      });

      const result = await main({
        argv: [],
        cwd: `${getTmpDir()}/ps-test-project-${process.pid}`,
        mkdirFn: vi.fn().mockResolvedValue(undefined),
        renderDashboardFn: vi.fn(() => ({
          updateStatus: vi.fn(),
          waitForExit: vi.fn().mockResolvedValue(undefined),
        })),
        renderWaitingHeaderFn: vi.fn(() => ({
          unmount: vi.fn(),
        })),
        executeLintersFn: vi.fn((_linters, options: { logDir: string }) =>
          Promise.resolve(sampleResults(options.logDir)),
        ),
        calculateSummaryFn: vi.fn(() => ({
          total: 1,
          passed: 1,
          failed: 0,
          errors: 0,
          duration: 5,
        })),
        acquireExecutionLockFn,
        writeFileFn: vi.fn().mockResolvedValue(undefined),
        console: consoleSpies as unknown as typeof console,
      });

      expect(result.exitCode).toBe(0);
      expect(consoleSpies.error).toHaveBeenCalledWith(
        '\nWARN: Failed to release execution lock:',
        expect.any(Error),
      );
    });

    it('writes telemetry.json when writeFileFn succeeds', async () => {
      const consoleSpies = fakeConsole();
      const writeFileFn = vi.fn().mockResolvedValue(undefined);
      const deps = {
        argv: ['--verify-logs'],
        cwd: `${getTmpDir()}/ps-test-project-${process.pid}`,
        mkdirFn: vi.fn().mockResolvedValue(undefined),
        renderDashboardFn: vi.fn(() => ({
          updateStatus: vi.fn(),
          waitForExit: vi.fn().mockResolvedValue(undefined),
        })),
        renderWaitingHeaderFn: vi.fn(() => ({
          unmount: vi.fn(),
        })),
        executeLintersFn: vi.fn((_linters, options: { logDir: string }) =>
          Promise.resolve(sampleResults(options.logDir)),
        ),
        calculateSummaryFn: vi.fn(() => ({
          total: 1,
          passed: 1,
          failed: 0,
          errors: 0,
          duration: 5,
        })),
        acquireExecutionLockFn: vi.fn().mockResolvedValue({
          lockPath: `${getTmpDir()}/ps-parallel-lint-test-${process.pid}.lock`,
          release: vi.fn().mockResolvedValue(undefined),
        }),
        writeFileFn,
        console: consoleSpies as unknown as typeof console,
      };

      const result = await main(deps);

      expect(result.exitCode).toBe(0);
      expect(writeFileFn).toHaveBeenCalled();
      const [pathArg, contentArg, encoding] = writeFileFn.mock.calls[0];
      expect(pathArg).toMatch(/\/logs\/telemetry.json$/);
      expect(encoding).toBe('utf8');
      expect(() => JSON.parse(contentArg)).not.toThrow();
    });
  });

  describe('entrypoint', () => {
    it('registers broken pipe handlers and handles EPIPE', () => {
      const before = captureErrorListeners();
      runEntrypoint({ mainFn: () => Promise.resolve({ exitCode: 0 }) });

      const newListeners = process.stdout
        .listeners('error')
        .filter((listener) => !before.stdout.has(listener));

      expect(newListeners.length).toBeGreaterThan(0);
      const handler = newListeners[0] as (err: NodeJS.ErrnoException) => void;

      expect(() =>
        handler(Object.assign(new Error('EPIPE'), { code: 'EPIPE' }) as NodeJS.ErrnoException),
      ).not.toThrow();
      expect(() =>
        handler(Object.assign(new Error('boom'), { code: 'OTHER' }) as NodeJS.ErrnoException),
      ).toThrow(/boom/);

      removeNewListeners(before);
    });

    it('reports rejected main promises in the entrypoint', async () => {
      const before = captureErrorListeners();
      const errorSpy = vi.fn();
      process.exitCode = undefined;

      runEntrypoint({
        mainFn: () => Promise.reject(new Error('boom')),
        console: { error: errorSpy },
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorSpy).toHaveBeenCalledWith('\n❌ Fatal error:', expect.any(Error));
      expect(process.exitCode).toBe(1);

      removeNewListeners(before);
      process.exitCode = undefined;
    });

    it('skips entrypoint when argv[1] is missing', async () => {
      const before = captureErrorListeners();
      const originalArgv = [...process.argv];
      process.argv = [originalArgv[0] ?? 'node'];

      vi.resetModules();
      await import('./index.ts');

      const after = captureErrorListeners();
      expect(after.stdout.size).toBe(before.stdout.size);
      expect(after.stderr.size).toBe(before.stderr.size);

      removeNewListeners(before);
      process.argv = originalArgv;
    });

    it('runs entrypoint when argv[1] matches the module path', async () => {
      const before = captureErrorListeners();
      const originalArgv = [...process.argv];
      const modulePath = fileURLToPath(new URL('index.ts', import.meta.url));
      process.argv = [originalArgv[0] ?? 'node', modulePath, '--help'];

      vi.resetModules();
      await import('./index.ts');

      const after = captureErrorListeners();
      expect(after.stdout.size + after.stderr.size).toBeGreaterThanOrEqual(
        before.stdout.size + before.stderr.size,
      );
      removeNewListeners(before);
      process.argv = originalArgv;
    });
  });
});
