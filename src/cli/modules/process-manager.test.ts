/**
 * Tests for process manager module
 */

/* eslint-disable unicorn/prefer-event-target */
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessError } from '../../errors.ts';
import { createLogger } from '../logger.ts';
import * as processManager from '../modules/process-manager.ts';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../logger.ts', () => ({
  appendToLog: vi.fn(),
  createLogger: vi.fn(),
  makeLogOptions: vi.fn(<T>(opts: T) => opts),
}));

const buildLinter = (mode: 'direct' | 'shell', timeoutMs = 10) => ({
  id: 'mock-linter',
  name: 'Mock Linter',
  binary: 'mock-binary',
  args: [],
  timeoutMs,
  mode,
  risk: 'low' as const,
  enforcement: 'advisory' as const,
  description: 'Mock linter',
});

const buildProc = () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = Object.assign(new EventEmitter(), {
    pid: 12_345,
    stdout,
    stderr,
    kill: vi.fn(),
  }) as unknown as ReturnType<typeof spawn>;
  // Prevent unhandled EventEmitter errors from being treated as test failures
  proc.on('error', () => {
    // Handled by the listener registered in runProcess
  });
  return proc;
};

describe('Process Manager Module', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTransientError', () => {
    it('returns false for non-Error values', () => {
      expect(processManager.isTransientError('string error')).toBe(false);
      expect(processManager.isTransientError(123)).toBe(false);
      expect(processManager.isTransientError(null)).toBe(false);
      expect(processManager.isTransientError(undefined)).toBe(false);
      expect(processManager.isTransientError({})).toBe(false);
    });

    it('recognizes transient errors', () => {
      expect(
        processManager.isTransientError(
          new ProcessError('PROCESS_SPAWN_FAILED', 'Process spawn failed: spawn'),
        ),
      ).toBe(true);
      expect(processManager.isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(processManager.isTransientError(new Error('ECONNREFUSED'))).toBe(true);
      expect(processManager.isTransientError(new Error('ETIMEDOUT'))).toBe(true);
      expect(processManager.isTransientError(new Error('ENOTFOUND'))).toBe(true);
      expect(processManager.isTransientError(new Error('spawn error'))).toBe(true);
      expect(processManager.isTransientError(new Error('ENOMEM'))).toBe(true);
    });

    it('returns false for non-transient errors', () => {
      expect(processManager.isTransientError(new Error('EACCES'))).toBe(false);
      expect(processManager.isTransientError(new Error('EPERM'))).toBe(false);
      expect(processManager.isTransientError(new Error('Generic error'))).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(processManager.isTransientError(new Error('econnreset'))).toBe(true);
      expect(processManager.isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(processManager.isTransientError(new Error('EConnReset'))).toBe(true);
    });

    it('recognizes combined error messages', () => {
      expect(
        processManager.isTransientError(new Error('Connection reset: ECONNRESET occurred')),
      ).toBe(true);
      expect(processManager.isTransientError(new Error('Failed to spawn: error in process'))).toBe(
        true,
      );
    });

    it('returns false for empty error messages', () => {
      expect(processManager.isTransientError(new Error('Unknown error'))).toBe(false);
    });
  });

  describe('runProcess', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const setupTimeoutRun = (mode: 'shell' | 'direct', timeout = 5) => {
      vi.useFakeTimers();
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockResolvedValue(undefined));
      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);
      const linter = buildLinter(mode, timeout);
      const runPromise = processManager.runProcess(linter, 'logs', false);
      runPromise.catch(() => {});
      return { proc, linter, runPromise } as const;
    };

    for (const mode of ['shell', 'direct'] as const) {
      it(`throws a timeout error for ${mode} mode`, async () => {
        const { linter, runPromise } = setupTimeoutRun(mode, 5);
        await vi.advanceTimersByTimeAsync(linter.timeoutMs + 100);
        await expect(runPromise).rejects.toThrow(`Timeout exceeded (${linter.timeoutMs}ms)`);
      });
    }

    it('sends the expected kill signal on timeout', async () => {
      const scenarios: ReadonlyArray<{ mode: 'shell' | 'direct'; signal: 'SIGTERM' | 'SIGKILL' }> =
        [
          { mode: 'shell', signal: 'SIGTERM' },
          { mode: 'direct', signal: 'SIGKILL' },
        ];
      for (const { mode, signal } of scenarios) {
        const { proc, linter, runPromise } = setupTimeoutRun(mode, 5);
        await vi.advanceTimersByTimeAsync(linter.timeoutMs + 100);
        await expect(runPromise).rejects.toThrow(`Timeout exceeded (${linter.timeoutMs}ms)`);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(proc.kill).toHaveBeenCalledWith(signal);
        vi.useRealTimers();
      }
    });

    it('captures output and resolves with default exit code', async () => {
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockResolvedValue(undefined));

      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const onStdout = stdout.on.bind(stdout);
      const onStderr = stderr.on.bind(stderr);
      stdout.on = ((event, listener) => {
        const result = onStdout(event, listener);
        if (event === 'data') {
          listener(Buffer.from('stdout-data'));
        }
        return result;
      }) as typeof stdout.on;
      stderr.on = ((event, listener) => {
        const result = onStderr(event, listener);
        if (event === 'data') {
          listener(Buffer.from('stderr-data'));
        }
        return result;
      }) as typeof stderr.on;

      const proc = Object.assign(new EventEmitter(), {
        pid: 12_345,
        stdout,
        stderr,
        kill: vi.fn(),
      }) as unknown as ReturnType<typeof spawn>;

      let spawnReady: (() => void) | undefined;
      const spawnReadyPromise = new Promise<void>((resolve) => {
        spawnReady = resolve;
      });
      vi.mocked(spawn).mockImplementation(() => {
        spawnReady?.();
        return proc;
      });

      const linter = buildLinter('direct', 5000);
      const runPromise = processManager.runProcess(linter, 'logs', false);

      await spawnReadyPromise;
      await Promise.resolve();
      proc.emit('close', null);

      const result = await runPromise;
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    }, 10_000);

    it('resolves with provided exit code', async () => {
      vi.useFakeTimers();
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockResolvedValue(undefined));

      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 5000);
      const runPromise = processManager.runProcess(linter, 'logs', false);

      await Promise.resolve();
      proc.emit('close', 0);
      // Allow the Promise to settle
      await Promise.resolve();

      const result = await runPromise;
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    }, 10_000);

    it('ignores output after the combined stream ends', async () => {
      const chunks: Buffer[] = [];
      vi.mocked(createLogger).mockResolvedValue(async (stream) => {
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
      });

      const proc = buildProc();
      let stdoutReady: (() => void) | undefined;
      const stdoutReadyPromise = new Promise<void>((resolve) => {
        stdoutReady = resolve;
      });
      const originalOn = proc.stdout.on.bind(proc.stdout);
      proc.stdout.on = ((event, listener) => {
        const result = originalOn(event, listener);
        if (event === 'data') {
          stdoutReady?.();
        }
        return result;
      }) as typeof proc.stdout.on;

      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 5000);
      const runPromise = processManager.runProcess(linter, 'logs', false);

      await stdoutReadyPromise;
      proc.stdout.emit('data', Buffer.from('first'));
      proc.emit('close', 0);
      proc.stdout.emit('data', Buffer.from('late'));

      const result = await runPromise;
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(chunks.map((chunk) => chunk.toString())).toEqual(['first']);
    });

    it('surfaces logger errors after successful process completion', async () => {
      const logError = new Error('log fail');
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockRejectedValue(logError));

      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 5000);
      const runPromise = processManager.runProcess(linter, 'logs', false);

      await Promise.resolve();
      proc.emit('close', 0);

      await expect(runPromise).rejects.toBe(logError);
    }, 10_000);

    it('propagates process errors and tolerates log failures', async () => {
      vi.useFakeTimers();
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockRejectedValue(new Error('log fail')));

      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 50);
      const runPromise = processManager.runProcess(linter, 'logs', false);
      // Suppress unhandled rejection during fake timer handling
      runPromise.catch(() => {});

      // Emit error before timeout
      await vi.advanceTimersByTimeAsync(10);
      const procError = new Error('spawn failed');
      proc.emit('error', procError);

      await expect(runPromise).rejects.toThrow('Process spawn failed: spawn failed');
    });

    it('attaches the original error as cause on spawn failure', async () => {
      vi.useFakeTimers();
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockResolvedValue(undefined));

      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 50);
      const runPromise = processManager.runProcess(linter, 'logs', false);
      // Suppress unhandled rejection during fake timer handling
      runPromise.catch(() => {});

      // Emit error before timeout
      await vi.advanceTimersByTimeAsync(10);
      const orig = new Error('underlying spawn failure');
      proc.emit('error', orig);

      await runPromise.catch((err) => {
        expect(err).toBeInstanceOf(ProcessError);
        expect((err as ProcessError).cause).toBe(orig);
      });
    });

    it('stringifies non-Error process errors', async () => {
      vi.useFakeTimers();
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockResolvedValue(undefined));

      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 50);
      const runPromise = processManager.runProcess(linter, 'logs', false);
      // Suppress unhandled rejection during fake timer handling
      runPromise.catch(() => {});

      // Emit error before timeout
      await vi.advanceTimersByTimeAsync(10);
      proc.emit('error', 'non-error failure');

      await expect(runPromise).rejects.toThrow('Process spawn failed: non-error failure');
    });

    it('stringifies object process errors', async () => {
      vi.useFakeTimers();
      vi.mocked(createLogger).mockResolvedValue(vi.fn().mockResolvedValue(undefined));

      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const linter = buildLinter('direct', 50);
      const runPromise = processManager.runProcess(linter, 'logs', false);
      // Suppress unhandled rejection during fake timer handling
      runPromise.catch(() => {});

      // Emit error before timeout
      await vi.advanceTimersByTimeAsync(10);
      proc.emit('error', { message: 'obj error' } as unknown as string);

      await expect(runPromise).rejects.toThrow('Process spawn failed: [object Object]');
    });
  });

  describe('killProcessTree', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('handles non-positive or undefined pid gracefully', () => {
      for (const pid of [0, undefined] as const) {
        const mockProc = {
          pid,
          kill: vi.fn(),
        } as unknown;
        expect(() => {
          processManager.killProcessTree(
            mockProc as ReturnType<typeof import('node:child_process').spawn>,
            true,
          );
        }).not.toThrow();
      }
    });

    it('calls kill with SIGKILL when graceful is false', () => {
      const killFn = vi.fn();
      const mockProc = {
        pid: 12_345,
        kill: killFn,
      } as unknown;

      processManager.killProcessTree(
        mockProc as ReturnType<typeof import('node:child_process').spawn>,
        false,
      );
      expect(killFn).toHaveBeenCalledWith('SIGKILL');
    });

    it('calls kill with SIGTERM when graceful is true', () => {
      vi.useFakeTimers();
      const killFn = vi.fn();
      const mockProc = {
        pid: 12_345,
        kill: killFn,
      } as unknown;

      processManager.killProcessTree(
        mockProc as ReturnType<typeof import('node:child_process').spawn>,
        true,
      );
      // SIGTERM is called immediately
      expect(killFn).toHaveBeenCalledWith('SIGTERM');
      // SIGKILL should be called after 5 second timeout
      vi.advanceTimersByTime(5100);
      expect(killFn).toHaveBeenCalledWith('SIGKILL');
    });

    it('handles process.kill failures gracefully', () => {
      const killFn = vi.fn(() => {
        throw new Error('Failed to kill');
      });
      const mockProc = {
        pid: 12_345,
        kill: killFn,
      } as unknown;

      // Should not throw even if process.kill fails
      expect(() => {
        processManager.killProcessTree(
          mockProc as ReturnType<typeof import('node:child_process').spawn>,
          false,
        );
      }).not.toThrow();
    });

    it('attempts both POSIX and direct kill methods', () => {
      const killFn = vi.fn();
      const processKillMock = vi.spyOn(process, 'kill').mockImplementation(() => {
        return true;
      });

      const mockProc = {
        pid: 12_345,
        kill: killFn,
      } as unknown;

      processManager.killProcessTree(
        mockProc as ReturnType<typeof import('node:child_process').spawn>,
        false,
      );

      // Should attempt process.kill
      expect(processKillMock).toHaveBeenCalled();
      // And also call proc.kill
      expect(killFn).toHaveBeenCalled();

      processKillMock.mockRestore();
    });

    it('handles valid positive pid', () => {
      const killFn = vi.fn();
      const mockProc = {
        pid: 99_999,
        kill: killFn,
      } as unknown;

      expect(() => {
        processManager.killProcessTree(
          mockProc as ReturnType<typeof import('node:child_process').spawn>,
          false,
        );
      }).not.toThrow();
    });

    it('uses taskkill on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        const mockProc = {
          pid: 12_345,
          kill: vi.fn(),
        } as unknown;

        processManager.killProcessTree(mockProc as ReturnType<typeof spawn>, false);
        expect(vi.mocked(spawn)).toHaveBeenCalledWith(
          String.raw`C:\Windows\System32\taskkill.exe`,
          ['/pid', '12345', '/T', '/F'],
          {
            stdio: 'ignore',
          },
        );
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });

  // Covered by parameterized timeout signal test above
});
