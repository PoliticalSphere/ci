/**
 * Political Sphere — CLI Tests (behavioral, coverage-oriented)
 */

import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createMainTestDeps } from '../__test-utils__/cli-main-fixtures.ts';
import type { LinterResult, LinterStatus } from './executor.ts';
import {
  ensureSafeDirectoryPath,
  main,
  parseCliArgs,
  resolveLinters,
  runEntrypoint,
  showHelp,
} from './index.ts';
import { LINTER_REGISTRY } from './linters.ts';

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

const fakeConsole = () => ({
  log: vi.fn(),
  error: vi.fn(),
});

const _createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
};

// Keep a non-underscored alias for tests that reference `createDeferred`.
const createDeferred = _createDeferred;

// Helper functions to reduce nesting in mock setups
const createParseError = (message: string, code: string, option?: string) => {
  const err = new Error(message);
  (err as { code?: string }).code = code;
  if (option) {
    (err as { code?: string; option?: string }).option = option;
  }
  return err;
};

const createParseArgsMock = (errorFactory: () => Error) => {
  return () => {
    throw errorFactory();
  };
};

const mockNodeUtil = async (parseArgsFn: () => never) => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    parseArgs: parseArgsFn,
  };
};

// Helper to create lock acquisition handler with deferred promise
const createLockAcquisitionHandler = (
  lockDeferred: ReturnType<
    typeof createDeferred<{ lockPath: string; release: () => Promise<void> }>
  >,
) => {
  return ({ onWaitStart, onWaitEnd }: { onWaitStart?: () => void; onWaitEnd?: () => void }) => {
    onWaitStart?.();
    return lockDeferred.promise.then((lock) => {
      onWaitEnd?.();
      return lock;
    });
  };
};

describe('Political Sphere — CLI', () => {
  describe('parseCliArgs', () => {
    it('parses defaults when no argv provided', () => {
      const args = parseCliArgs([]);

      expect(args.verifyLogs).toBe(false);
      expect(args.logDir).toBe('./logs');
      expect(args.help).toBe(false);
      expect(args.verbose).toBe(false);
      expect(args.linters).toBeUndefined();
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

      expect(args.verifyLogs).toBe(true);
      expect(args.logDir).toBe('./build/logs');
      expect(args.linters).toEqual(['eslint']);
      expect(args.verbose).toBe(true);
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
  });

  describe('entrypoint', () => {
    const captureErrorListeners = () => ({
      stdout: new Set(process.stdout.listeners('error')),
      stderr: new Set(process.stderr.listeners('error')),
    });

    const removeNewListeners = (before: { stdout: Set<unknown>; stderr: Set<unknown> }) => {
      for (const listener of process.stdout.listeners('error')) {
        if (!before.stdout.has(listener)) {
          process.stdout.off('error', listener as (...args: unknown[]) => void);
        }
      }
      for (const listener of process.stderr.listeners('error')) {
        if (!before.stderr.has(listener)) {
          process.stderr.off('error', listener as (...args: unknown[]) => void);
        }
      }
    };

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
      expect(after.stdout.size).toBeGreaterThan(before.stdout.size);

      removeNewListeners(before);
      process.argv = originalArgv;
    });
  });
});
