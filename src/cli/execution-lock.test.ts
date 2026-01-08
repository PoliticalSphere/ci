/**
 * Political Sphere — Execution Lock Tests
 */

import { EventEmitter as NodeEventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireExecutionLock, DEFAULT_EXECUTION_LOCK_PATH } from './execution-lock.ts';

let tempDir = '';

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(process.cwd(), 'tmp-lock-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe('Political Sphere — Execution Lock', () => {
  it('uses the default lock path when none is provided', async () => {
    const writeFileFn = vi.fn(async () => undefined);
    const unlinkFn = vi.fn(async () => undefined);

    const lock = await acquireExecutionLock({
      writeFileFn,
      unlinkFn,
      sleepFn: async () => undefined,
    });

    expect(lock.lockPath).toBe(DEFAULT_EXECUTION_LOCK_PATH);
    expect(writeFileFn).toHaveBeenCalledWith(DEFAULT_EXECUTION_LOCK_PATH, expect.any(String), {
      flag: 'wx',
    });

    await lock.release();
    expect(unlinkFn).toHaveBeenCalledWith(DEFAULT_EXECUTION_LOCK_PATH);
  });

  it('acquires and releases the lock file', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');

    const lock = await acquireExecutionLock({ lockPath });
    const payload = JSON.parse(await readFile(lockPath, 'utf8')) as {
      pid: number;
      createdAt: number;
    };

    expect(payload.pid).toBe(process.pid);
    expect(typeof payload.createdAt).toBe('number');

    await lock.release();
    await expect(stat(lockPath)).rejects.toThrow();
  });

  it('blocks while another process holds the lock and resumes after release', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');

    const first = await acquireExecutionLock({ lockPath, pollIntervalMs: 5 });
    const onWaitStart = vi.fn();
    const onWaitEnd = vi.fn();

    const secondPromise = acquireExecutionLock({
      lockPath,
      pollIntervalMs: 5,
      onWaitStart,
      onWaitEnd,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onWaitStart).toHaveBeenCalledTimes(1);
    expect(onWaitEnd).not.toHaveBeenCalled();

    await first.release();
    const second = await secondPromise;

    expect(onWaitEnd).toHaveBeenCalledTimes(1);
    await second.release();
  });

  it('cleans up stale locks without entering a wait state', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    await writeFile(lockPath, JSON.stringify({ pid: 0, createdAt: Date.now() }), 'utf8');

    const onWaitStart = vi.fn();
    const lock = await acquireExecutionLock({ lockPath, onWaitStart, pollIntervalMs: 1 });

    expect(onWaitStart).not.toHaveBeenCalled();
    await lock.release();
  });

  it('releases the lock on signal interruption', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    const emitter = new NodeEventEmitter();
    const killSpy = vi.fn();

    const fakeProcess = Object.assign(emitter, {
      pid: 4242,
      kill: killSpy,
      exitCode: undefined as number | undefined,
    }) as unknown as NodeJS.Process;

    await acquireExecutionLock({ lockPath, processRef: fakeProcess });

    fakeProcess.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(stat(lockPath)).rejects.toThrow();
    expect(killSpy).toHaveBeenCalledWith(4242, 'SIGTERM');
  });

  it('handles corrupt lock files with invalid JSON', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    await writeFile(lockPath, 'not valid json', 'utf8');

    const onWaitStart = vi.fn();
    const lock = await acquireExecutionLock({ lockPath, onWaitStart });

    expect(onWaitStart).not.toHaveBeenCalled();
    await lock.release();
  });

  it('handles lock files with null content', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    await writeFile(lockPath, 'null', 'utf8');

    const lock = await acquireExecutionLock({ lockPath });
    expect(typeof lock.release).toBe('function');
    await lock.release();
    await expect(stat(lockPath)).rejects.toThrow();
  });

  it('handles lock files with non-finite pid', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    await writeFile(lockPath, JSON.stringify({ pid: Number.NaN, createdAt: Date.now() }), 'utf8');

    const lock = await acquireExecutionLock({ lockPath });
    expect(typeof lock.release).toBe('function');
    await lock.release();
    await expect(stat(lockPath)).rejects.toThrow();
  });

  it('handles lock files with non-finite createdAt', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 1234, createdAt: Number.POSITIVE_INFINITY }),
      'utf8',
    );

    const lock = await acquireExecutionLock({ lockPath });
    expect(typeof lock.release).toBe('function');
    await lock.release();
    await expect(stat(lockPath)).rejects.toThrow();
  });

  it('throws when unlink fails with error other than ENOENT', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    // Create a stale lock file first
    await writeFile(lockPath, JSON.stringify({ pid: 0, createdAt: Date.now() }), 'utf8');

    const unlinkError = Object.assign(new Error('Permission denied'), { code: 'EPERM' });
    const unlinkFn = vi.fn().mockRejectedValue(unlinkError);

    await expect(
      acquireExecutionLock({
        lockPath,
        unlinkFn,
      }),
    ).rejects.toThrow('Failed to remove execution lock');
  });

  it('throws when writeFile fails with error other than EEXIST', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    const writeError = Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    const writeFileFn = vi.fn().mockRejectedValue(writeError);

    await expect(
      acquireExecutionLock({
        lockPath,
        writeFileFn,
      }),
    ).rejects.toThrow('Failed to acquire execution lock');
  });

  it('does not call release twice', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    const unlinkFn = vi.fn().mockResolvedValue(undefined);

    const lock = await acquireExecutionLock({ lockPath, unlinkFn });

    await lock.release();
    await lock.release();

    expect(unlinkFn).toHaveBeenCalledTimes(1);
  });

  it('handles signal handler when kill throws an error', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    const emitter = new NodeEventEmitter();
    const killSpy = vi.fn().mockImplementation((_pid, signal) => {
      if (signal === 'SIGINT') {
        throw new Error('Kill failed');
      }
    });

    const fakeProcess = Object.assign(emitter, {
      pid: 4242,
      kill: killSpy,
      exitCode: undefined as number | undefined,
    }) as unknown as NodeJS.Process;

    await acquireExecutionLock({ lockPath, processRef: fakeProcess });

    fakeProcess.emit('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fakeProcess.exitCode).toBe(1);
  });

  it('releases the lock on exit event', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    const emitter = new NodeEventEmitter();
    const unlinkFn = vi.fn().mockResolvedValue(undefined);

    const fakeProcess = Object.assign(emitter, {
      pid: 4242,
      kill: vi.fn(),
      exitCode: undefined as number | undefined,
    }) as unknown as NodeJS.Process;

    await acquireExecutionLock({ lockPath, processRef: fakeProcess, unlinkFn });

    fakeProcess.emit('exit');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(unlinkFn).toHaveBeenCalled();
  });

  it('detects when process is not alive via isProcessAlive', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    const emitter = new NodeEventEmitter();
    const killSpy = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
    });

    const fakeProcess = Object.assign(emitter, {
      pid: 4242,
      kill: killSpy,
      exitCode: undefined as number | undefined,
    }) as unknown as NodeJS.Process;

    // Create a lock with a fake PID
    await writeFile(lockPath, JSON.stringify({ pid: 99_999, createdAt: Date.now() }), 'utf8');

    // Acquire should succeed by detecting the lock is stale
    const lock = await acquireExecutionLock({ lockPath, processRef: fakeProcess });
    expect(typeof lock.release).toBe('function');
    await lock.release();
    await expect(stat(lockPath)).rejects.toThrow();
  });

  it('silently ignores ENOENT errors when unlinking stale locks (line 95)', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    let unlinkCallCount = 0;
    const unlinkFn = vi.fn(async () => {
      unlinkCallCount++;
      if (unlinkCallCount === 1) {
        // First call: simulate file already deleted (ENOENT) - should be silently ignored
        throw Object.assign(new Error('No such file'), { code: 'ENOENT' });
      }
      // Subsequent calls succeed
      return undefined;
    });

    let writeCallCount = 0;
    const writeFileFn = vi.fn(async () => {
      writeCallCount++;
      if (writeCallCount === 1) {
        // First attempt fails with EEXIST (lock file from before)
        throw Object.assign(new Error('File exists'), { code: 'EEXIST' });
      }
      // Second attempt succeeds
      return undefined;
    });

    // Create a stale lock file
    await writeFile(lockPath, JSON.stringify({ pid: 0, createdAt: Date.now() }), 'utf8');

    const lock = await acquireExecutionLock({
      lockPath,
      unlinkFn,
      writeFileFn: writeFileFn as typeof writeFile,
      pollIntervalMs: 1,
    });

    expect(lock).toBeDefined();
    await lock.release();
  });

  it('retries lock acquisition when writeFile fails with EEXIST (line 104)', async () => {
    const lockPath = path.join(tempDir, 'ps-parallel-lint.lock');
    let writeCallCount = 0;
    const writeFileFn = vi.fn(async () => {
      writeCallCount++;
      if (writeCallCount === 1) {
        // First attempt: lock file already exists with a stale PID
        throw Object.assign(new Error('File exists'), { code: 'EEXIST' });
      }
      // After stale lock is removed and retried, second attempt succeeds
      return undefined;
    });

    // Create a stale lock file (pid: 0 will be detected as not alive)
    await writeFile(lockPath, JSON.stringify({ pid: 0, createdAt: Date.now() }), 'utf8');

    const lock = await acquireExecutionLock({
      lockPath,
      writeFileFn: writeFileFn as typeof writeFile,
      unlinkFn: async () => undefined,
      pollIntervalMs: 1,
    });

    expect(writeFileFn).toHaveBeenCalledTimes(2);
    expect(lock).toBeDefined();
    await lock.release();
  });
});
