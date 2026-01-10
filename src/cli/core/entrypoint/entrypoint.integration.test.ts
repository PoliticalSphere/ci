import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

const shouldSkipTsx = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as { stderr?: string; message?: string };
  const stderr = err.stderr ?? err.message ?? '';
  return stderr.includes('listen EPERM') && stderr.includes('tsx');
};

describe('entrypoint integration', () => {
  it('prints help output when --help is provided', async () => {
    const before = captureErrorListeners();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const originalArgv = [...process.argv];
    process.argv = [originalArgv[0] ?? 'node', originalArgv[1] ?? 'script', '--help'];

    runEntrypoint();

    await new Promise((resolve) => setImmediate(resolve));

    expect(logSpy).toHaveBeenCalled();
    expect(String(logSpy.mock.calls[0]?.[0] ?? '')).toContain('USAGE');

    logSpy.mockRestore();
    removeNewListeners(before);
    process.argv = originalArgv;
  });

  it('prints version output when --version is provided', async () => {
    const before = captureErrorListeners();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const originalArgv = [...process.argv];
    process.argv = [originalArgv[0] ?? 'node', originalArgv[1] ?? 'script', '--version'];

    runEntrypoint();

    await new Promise((resolve) => setImmediate(resolve));

    expect(logSpy).toHaveBeenCalled();
    expect(String(logSpy.mock.calls[0]?.[0] ?? '')).toMatch(/^@politicalsphere\/ci v/);

    logSpy.mockRestore();
    removeNewListeners(before);
    process.argv = originalArgv;
  });

  it('executes the CLI entrypoint via tsx and prints help', async () => {
    const tsxBin =
      process.platform === 'win32'
        ? path.join(process.cwd(), 'node_modules', '.bin', 'tsx.cmd')
        : path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    try {
      const { stdout } = await execFileAsync(tsxBin, ['./src/cli/index.ts', '--help'], {
        cwd: process.cwd(),
        env: { ...process.env, TSX_DISABLE_IPC: '1' },
      });

      expect(stdout).toContain('USAGE');
    } catch (error) {
      if (shouldSkipTsx(error)) {
        return;
      }
      throw error;
    }
  });

  it('handles EPIPE on stderr without throwing', () => {
    const before = captureErrorListeners();

    runEntrypoint({ mainFn: () => Promise.resolve({ exitCode: 0 }) });

    const newErrListeners = process.stderr
      .listeners('error')
      .filter((listener) => !before.stderr.has(listener));

    expect(newErrListeners.length).toBeGreaterThan(0);
    const errHandler = newErrListeners[0] as (err: NodeJS.ErrnoException) => void;
    expect(() =>
      errHandler(Object.assign(new Error('EPIPE'), { code: 'EPIPE' }) as NodeJS.ErrnoException),
    ).not.toThrow();

    removeNewListeners(before);
  });
  it('invokes onSignal handler and sets exit code on SIGINT', async () => {
    const before = captureErrorListeners();
    const spy = vi.fn(() => Promise.resolve());
    const originalExit = process.exitCode;

    // Provide a mainFn that never resolves to keep entrypoint running
    runEntrypoint({ mainFn: () => new Promise((_resolve) => {}), onSignal: spy });

    // Simulate SIGINT
    process.emit('SIGINT');

    await new Promise((resolve) => setImmediate(resolve));

    expect(spy).toHaveBeenCalledWith('SIGINT');
    expect(process.exitCode).toBe(130);

    removeNewListeners(before);
    process.exitCode = originalExit;
  });

  it('reports rejected main promises and logs wrapped AppError with sanitized argv', async () => {
    const before = captureErrorListeners();
    const errorSpy = vi.fn();
    const originalArgv = [...process.argv];
    // The test deliberately includes a password flag to assert redaction.
    process.argv = [
      originalArgv[0] ?? 'node',
      originalArgv[1] ?? 'script',
      'secret-token',
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test fixture for redaction
      '--password=<redacted>',
    ];

    // Run entrypoint with a rejecting main and injected console
    runEntrypoint({
      mainFn: () => Promise.reject(new Error('boom')),
      console: { error: errorSpy },
    });

    await new Promise((resolve) => setImmediate(resolve));

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

    removeNewListeners(before);
    process.argv = originalArgv;
  });
});
