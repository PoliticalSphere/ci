/**
 * Process-level execution lock for the parallel linter CLI.
 * Ensures only one orchestrator instance runs at a time.
 */

import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ExecutionLockError } from '../errors.ts';

const DEFAULT_LOCK_FILENAME = 'ps-parallel-lint.lock';
const DEFAULT_POLL_INTERVAL_MS = 250;

export const DEFAULT_EXECUTION_LOCK_PATH = path.join(tmpdir(), DEFAULT_LOCK_FILENAME);

export interface ExecutionLockOptions {
  readonly lockPath?: string | undefined;
  readonly pollIntervalMs?: number;
  readonly onWaitStart?: () => void;
  readonly onWaitEnd?: () => void;
  readonly processRef?: NodeJS.Process;
  readonly nowFn?: () => number;
  readonly sleepFn?: (ms: number) => Promise<void>;
  readonly readFileFn?: typeof readFile;
  readonly writeFileFn?: typeof writeFile;
  readonly unlinkFn?: typeof unlink;
}

export interface ExecutionLock {
  readonly lockPath: string;
  release: () => Promise<void>;
}

interface LockFilePayload {
  readonly pid: number;
  readonly createdAt: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number, processRef: NodeJS.Process): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    processRef.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === 'EPERM';
  }
}

async function readLockFile(
  lockPath: string,
  readFileFn: typeof readFile,
): Promise<LockFilePayload | null> {
  try {
    const raw = await readFileFn(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LockFilePayload> | null;
    if (!parsed) {
      return null;
    }
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid)) {
      return null;
    }
    if (typeof parsed.createdAt !== 'number' || !Number.isFinite(parsed.createdAt)) {
      return null;
    }
    return { pid: parsed.pid, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

async function isLockStale(
  lockPath: string,
  readFileFn: typeof readFile,
  processRef: NodeJS.Process,
): Promise<boolean> {
  const payload = await readLockFile(lockPath, readFileFn);
  if (!payload) {
    return true;
  }
  return !isProcessAlive(payload.pid, processRef);
}

async function safeUnlink(lockPath: string, unlinkFn: typeof unlink): Promise<void> {
  try {
    await unlinkFn(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ENOENT') {
      throw new ExecutionLockError(
        'EXECUTION_LOCK_RELEASE_FAILED',
        `Failed to remove execution lock at ${lockPath}`,
        { cause: error, details: { lockPath } },
      );
    }
  }
}

export async function acquireExecutionLock(
  options: ExecutionLockOptions = {},
): Promise<ExecutionLock> {
  const lockPath = options.lockPath ?? DEFAULT_EXECUTION_LOCK_PATH;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const processRef = options.processRef ?? process;
  const nowFn = options.nowFn ?? Date.now;
  const sleepFn = options.sleepFn ?? defaultSleep;
  const readFileFn = options.readFileFn ?? readFile;
  const writeFileFn = options.writeFileFn ?? writeFile;
  const unlinkFn = options.unlinkFn ?? unlink;

  let waiting = false;

  const tryAcquire = async (): Promise<boolean> => {
    try {
      const payload: LockFilePayload = { pid: processRef.pid, createdAt: nowFn() };
      await writeFileFn(lockPath, JSON.stringify(payload), { flag: 'wx' });
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'EEXIST') {
        return false;
      }
      throw new ExecutionLockError(
        'EXECUTION_LOCK_ACQUIRE_FAILED',
        `Failed to acquire execution lock at ${lockPath}`,
        { cause: error, details: { lockPath } },
      );
    }
  };

  while (!(await tryAcquire())) {
    if (await isLockStale(lockPath, readFileFn, processRef)) {
      await safeUnlink(lockPath, unlinkFn);
      continue;
    }

    if (!waiting) {
      waiting = true;
      options.onWaitStart?.();
    }

    await sleepFn(pollIntervalMs);
  }

  if (waiting) {
    options.onWaitEnd?.();
  }

  let released = false;
  const cleanupHandlers: Array<() => void> = [];

  const release = async (): Promise<void> => {
    if (released) {
      return;
    }
    released = true;
    for (const cleanup of cleanupHandlers.splice(0)) {
      cleanup();
    }
    await safeUnlink(lockPath, unlinkFn);
  };

  const registerSignalHandler = (signal: NodeJS.Signals): void => {
    const handler = (): void => {
      void release().finally(() => {
        processRef.removeListener(signal, handler);
        try {
          processRef.kill(processRef.pid, signal);
        } catch {
          processRef.exitCode ??= 1;
        }
      });
    };

    processRef.on(signal, handler);
    cleanupHandlers.push(() => processRef.removeListener(signal, handler));
  };

  registerSignalHandler('SIGINT');
  registerSignalHandler('SIGTERM');
  registerSignalHandler('SIGHUP');
  registerSignalHandler('SIGQUIT');

  const exitHandler = (): void => {
    void release();
  };

  processRef.once('exit', exitHandler);
  cleanupHandlers.push(() => processRef.removeListener('exit', exitHandler));

  return { lockPath, release };
}
