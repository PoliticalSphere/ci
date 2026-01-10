/**
 * Tests for the CLI entrypoint wiring (broken pipes, error handling, signals).
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  expectSanitizedArgv,
  findFatalErrorCall,
} from '../../../__test-utils__/assertions/entrypoint-helpers';
import {
  captureErrorListeners,
  removeNewListeners,
} from '../../../__test-utils__/mocks/process/error-listeners';
import { runEntrypoint } from './entrypoint.ts';

describe('entrypoint.ts', () => {
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

    const newErrListeners = process.stderr
      .listeners('error')
      .filter((listener) => !before.stderr.has(listener));

    expect(newErrListeners.length).toBeGreaterThan(0);
    const errHandler = newErrListeners[0] as (err: NodeJS.ErrnoException) => void;

    expect(() =>
      errHandler(Object.assign(new Error('EPIPE'), { code: 'EPIPE' }) as NodeJS.ErrnoException),
    ).not.toThrow();
    expect(() =>
      errHandler(Object.assign(new Error('boom'), { code: 'OTHER' }) as NodeJS.ErrnoException),
    ).toThrow(/boom/);

    removeNewListeners(before);
  });

  it('reports rejected main promises in the entrypoint and includes sanitized argv', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.fn();
    process.exitCode = undefined;

    runEntrypoint({
      mainFn: () => Promise.reject(new Error('boom')),
      console: { error: errorSpy },
    });

    await new Promise((resolve) => setImmediate(resolve));

    // Ensure we logged a fatal error call and that argv is sanitized
    const passedError = findFatalErrorCall(errorSpy);
    expect(passedError).toBeDefined();
    expect(passedError?.code).toBe('UNEXPECTED_ERROR');
    if (passedError?.cause && typeof passedError.cause === 'object') {
      const cause = passedError.cause as { message?: unknown };
      if (cause && typeof cause.message === 'string') {
        expect(cause.message).toBe('boom');
      }
    }

    expectSanitizedArgv(passedError);

    expect(process.exitCode).toBe(1);

    removeNewListeners(before);
    process.exitCode = undefined;
  });

  it('uses the default console when no console is injected', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runEntrypoint({
      mainFn: () => Promise.reject(new Error('boom')),
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith('\n❌ Fatal error:', expect.any(Error));

    errorSpy.mockRestore();
    removeNewListeners(before);
  });

  it('preserves short flags when sanitizing argv', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.fn();
    const originalArgv = [...process.argv];
    process.argv = [originalArgv[0] ?? 'node', originalArgv[1] ?? 'entrypoint', '-v', 'secret'];

    runEntrypoint({
      mainFn: () => Promise.reject(new Error('boom')),
      console: { error: errorSpy },
    });

    await new Promise((resolve) => setImmediate(resolve));

    const fatalCall = errorSpy.mock.calls.find((c) => c[0] === '\n❌ Fatal error:');
    const passedError = fatalCall?.[1] as Record<string, unknown> | undefined;
    const details = passedError?.details as { context?: { argv?: unknown } } | undefined;
    const argvArr = (details?.context?.argv as string[] | undefined) ?? [];

    expect(argvArr).toContain('-v');
    expect(argvArr).toContain('<redacted>');

    removeNewListeners(before);
    process.argv = originalArgv;
  });

  it('redacts non-string argv entries', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.fn();
    const originalArgv = [...process.argv];
    process.argv = [
      originalArgv[0] ?? 'node',
      originalArgv[1] ?? 'entrypoint',
      undefined as unknown as string,
      '--token=abc',
      '--verbose',
    ];

    runEntrypoint({
      mainFn: () => Promise.reject(new Error('boom')),
      console: { error: errorSpy },
    });

    await new Promise((resolve) => setImmediate(resolve));

    const fatalCall = errorSpy.mock.calls.find((c) => c[0] === '\n❌ Fatal error:');
    const passedError = fatalCall?.[1] as Record<string, unknown> | undefined;
    const details = passedError?.details as { context?: { argv?: unknown } } | undefined;
    const argvArr = (details?.context?.argv as string[] | undefined) ?? [];

    expect(argvArr).toContain('<redacted>');
    expect(argvArr).toContain('--token=<redacted>');
    expect(argvArr).toContain('--verbose');

    removeNewListeners(before);
    process.argv = originalArgv;
  });

  it('ignores repeated signals and logs signal handler failures', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.fn();
    const onSignal = vi.fn(() => {
      throw new Error('signal-fail');
    });
    let resolveMain: (result: { exitCode: number }) => void;
    const mainPromise = new Promise<{ exitCode: number }>((resolve) => {
      resolveMain = resolve;
    });

    runEntrypoint({
      mainFn: () => mainPromise,
      console: { error: errorSpy },
      onSignal,
    });

    process.emit('SIGINT');
    process.emit('SIGINT');
    process.emit('SIGTERM');

    if (!resolveMain) {
      throw new Error('resolveMain not initialized');
    }
    resolveMain({ exitCode: 0 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('\nWARN: signal handler failed:', expect.any(Error));

    removeNewListeners(before);
  });

  it('logs wrapped errors for non-Error rejections and reports async handler failures', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.fn();
    const onSignal = vi.fn(() => Promise.reject(new Error('async-signal-fail')));

    runEntrypoint({
      mainFn: () => Promise.reject('boom-string'),
      console: { error: errorSpy },
      onSignal,
    });

    process.emit('SIGTERM');

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const fatalCalls = errorSpy.mock.calls.filter((c) => c[0] === '\n❌ Fatal error:');
    expect(fatalCalls.length).toBeGreaterThanOrEqual(1);
    const firstError = fatalCalls[0]?.[1] as { message?: unknown; code?: unknown } | undefined;
    expect(firstError?.message).toBe('boom-string');
    expect(firstError?.code).toBe('UNEXPECTED_ERROR');

    expect(errorSpy).toHaveBeenCalledWith('\nWARN: signal handler failed:', expect.any(Error));

    removeNewListeners(before);
  });

  it('sets exit code on signal when no handler is provided', async () => {
    const before = captureErrorListeners();
    const originalExitCode = process.exitCode;
    let resolveMain: (result: { exitCode: number }) => void;
    const mainPromise = new Promise<{ exitCode: number }>((resolve) => {
      resolveMain = resolve;
    });

    runEntrypoint({
      mainFn: () => mainPromise,
      console: { error: vi.fn() },
    });

    process.emit('SIGINT');

    if (!resolveMain) {
      throw new Error('resolveMain not initialized');
    }
    resolveMain({ exitCode: 0 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(process.exitCode).toBe(130);

    removeNewListeners(before);
    process.exitCode = originalExitCode;
  });

  it('removes signal handlers after successful completion', async () => {
    const beforeSigint = new Set(process.listeners('SIGINT'));
    const beforeSigterm = new Set(process.listeners('SIGTERM'));

    runEntrypoint({ mainFn: () => Promise.resolve({ exitCode: 0 }) });

    await new Promise((resolve) => setImmediate(resolve));

    const afterSigint = process.listeners('SIGINT');
    const afterSigterm = process.listeners('SIGTERM');

    for (const listener of afterSigint) {
      expect(beforeSigint.has(listener)).toBe(true);
    }
    for (const listener of afterSigterm) {
      expect(beforeSigterm.has(listener)).toBe(true);
    }
  });

  it('removes signal handlers after rejection', async () => {
    const beforeSigint = new Set(process.listeners('SIGINT'));
    const beforeSigterm = new Set(process.listeners('SIGTERM'));

    runEntrypoint({ mainFn: () => Promise.reject(new Error('boom')) });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const afterSigint = process.listeners('SIGINT');
    const afterSigterm = process.listeners('SIGTERM');

    for (const listener of afterSigint) {
      expect(beforeSigint.has(listener)).toBe(true);
    }
    for (const listener of afterSigterm) {
      expect(beforeSigterm.has(listener)).toBe(true);
    }
  });

  it('calls executeWithArgs when no help/version flags are set', async () => {
    const originalArgv = [...process.argv];
    process.argv = [originalArgv[0] ?? 'node', '/tmp/not-entrypoint'];

    try {
      vi.resetModules();
      vi.doMock('../../input/args.ts', () => ({
        parseCliArgs: () => ({ version: false, help: false }),
      }));
      vi.doMock('../help/help.ts', () => ({
        showVersion: () => 'ignored',
      }));
      vi.doMock('../help/formatter.ts', () => ({
        showHelp: () => 'ignored',
      }));
      const executeSpy = vi.fn().mockResolvedValue({ exitCode: 0 });
      vi.doMock('../../execution/execution.ts', () => ({
        executeWithArgs: executeSpy,
      }));

      const { runEntrypoint: runEntrypointWithMocks } = await import('./entrypoint.ts');
      runEntrypointWithMocks();
      await new Promise((resolve) => setImmediate(resolve));

      expect(executeSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.argv = originalArgv;
      vi.doUnmock('../../input/args.ts');
      vi.doUnmock('../help/help.ts');
      vi.doUnmock('../help/formatter.ts');
      vi.doUnmock('../../execution/execution.ts');
      vi.resetModules();
    }
  });

  it('prints help and skips execution when help flag is set', async () => {
    const originalArgv = [...process.argv];
    process.argv = [originalArgv[0] ?? 'node', '/tmp/not-entrypoint'];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      vi.resetModules();
      vi.doMock('../../input/args.ts', () => ({
        parseCliArgs: () => ({ version: false, help: true }),
      }));
      vi.doMock('../help/formatter.ts', () => ({
        showHelp: () => 'help-output',
      }));
      const executeSpy = vi.fn().mockResolvedValue({ exitCode: 0 });
      vi.doMock('../../execution/execution.ts', () => ({
        executeWithArgs: executeSpy,
      }));

      const { runEntrypoint: runEntrypointWithMocks } = await import('./entrypoint.ts');
      runEntrypointWithMocks();
      await new Promise((resolve) => setImmediate(resolve));

      expect(logSpy).toHaveBeenCalledWith('help-output');
      expect(executeSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      process.argv = originalArgv;
      vi.doUnmock('../../input/args.ts');
      vi.doUnmock('../help/formatter.ts');
      vi.doUnmock('../../execution/execution.ts');
      vi.resetModules();
    }
  });

  it('skips entrypoint when argv[1] is missing', async () => {
    const before = captureErrorListeners();
    const originalArgv = [...process.argv];
    process.argv = [originalArgv[0] ?? 'node'];

    vi.resetModules();
    await import('./entrypoint.ts');

    const after = captureErrorListeners();
    expect(after.stdout.size).toBe(before.stdout.size);
    expect(after.stderr.size).toBe(before.stderr.size);

    removeNewListeners(before);
    process.argv = originalArgv;
  });

  it('runs entrypoint when argv[1] matches the module path', async () => {
    const before = captureErrorListeners();
    const originalArgv = [...process.argv];
    const modulePath = fileURLToPath(new URL('entrypoint.ts', import.meta.url));
    process.argv = [originalArgv[0] ?? 'node', modulePath, '--help'];

    vi.resetModules();
    await import('./entrypoint.ts');

    const after = captureErrorListeners();
    expect(after.stdout.size).toBeGreaterThan(before.stdout.size);

    removeNewListeners(before);
    process.argv = originalArgv;
  });

  // Signal handling behavior is tested elsewhere or not applicable in some
  // CI environments; explicit SIG tests were removed to avoid flakiness.
});
