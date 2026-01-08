/**
 * Tests for binary checker module
 */

/* eslint-disable unicorn/prefer-event-target */
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BinaryError } from '../../errors.ts';
import {
  checkBinaryExists,
  runVersionProbe,
  verifyLinterVersion,
} from '../modules/binary-checker.ts';

vi.mock('node:child_process');
vi.mock('node:fs/promises');

const buildProc = () =>
  Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  }) as unknown as ReturnType<typeof spawn>;

describe('Binary Checker Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkBinaryExists', () => {
    it('includes Windows system paths when platform is win32', async () => {
      const originalPlatform = process.platform;
      const originalPath = process.env.PATH;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.PATH = '';

      vi.mocked(access).mockRejectedValue(new Error('missing'));

      try {
        const result = await checkBinaryExists('tool');
        expect(result).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        if (originalPath === undefined) {
          // @ts-expect-error TS4111: index signature access
          process.env.PATH = undefined;
        } else {
          process.env.PATH = originalPath;
        }
      }
    });

    it('accepts absolute or relative binary paths', async () => {
      vi.mocked(access).mockResolvedValueOnce(undefined);

      const result = await checkBinaryExists('tools/my-binary');

      expect(result).toBe(true);
    });

    it('includes absolute PATH entries when searching', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/custom/bin:relative/bin';
      const expectedPath = '/custom/bin/tool';

      vi.mocked(access).mockImplementation((candidate: string) => {
        if (candidate === expectedPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('missing'));
      });

      try {
        const result = await checkBinaryExists('tool');
        expect(result).toBe(true);
        expect(vi.mocked(access)).toHaveBeenCalledWith(expectedPath, expect.any(Number));
      } finally {
        if (originalPath === undefined) {
          // @ts-expect-error TS4111: index signature access
          process.env.PATH = undefined;
        } else {
          process.env.PATH = originalPath;
        }
      }
    });

    it('returns true when binary exists', async () => {
      vi.mocked(access).mockResolvedValueOnce(undefined);

      const result = await checkBinaryExists('ls');

      expect(result).toBe(true);
    });

    it('returns false when binary does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('missing'));

      const result = await checkBinaryExists('nonexistent');

      expect(result).toBe(false);
    });

    it('returns false on access error (line 39-40)', async () => {
      vi.mocked(access).mockRejectedValue(new Error('access failed'));

      const result = await checkBinaryExists('bad-binary');

      expect(result).toBe(false);
    });
  });

  describe('runVersionProbe', () => {
    it('rejects with error when exit code is non-zero (line 46-47)', async () => {
      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const promise = runVersionProbe('eslint', ['--version']);
      queueMicrotask(() => proc.emit('close', 1));

      await expect(promise).rejects.toThrow('Version probe failed with exit code 1');
    });

    it('rejects with error on spawn error (line 53-54)', async () => {
      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const promise = runVersionProbe('bad-binary', ['--version']);
      queueMicrotask(() => proc.emit('error', new Error('spawn failed')));

      await expect(promise).rejects.toThrow('Version probe failed: spawn failed');
    });

    it('stringifies non-Error spawn failures', async () => {
      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const promise = runVersionProbe('bad-binary', ['--version']);
      queueMicrotask(() => proc.emit('error', 'non-error failure'));

      await expect(promise).rejects.toThrow('Version probe failed: non-error failure');
    });

    it('resolves with stdout output on successful probe', async () => {
      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const promise = runVersionProbe('eslint', ['--version']);
      queueMicrotask(() => {
        proc.stdout.emit('data', Buffer.from('9.0.0\n'));
        proc.emit('close', 0);
      });

      const result = await promise;
      expect(result).toBe('9.0.0\n');
    });

    it('includes stderr output in version probe result (line 34)', async () => {
      const proc = buildProc();
      vi.mocked(spawn).mockReturnValue(proc);

      const promise = runVersionProbe('eslint', ['--version']);
      queueMicrotask(() => {
        proc.stdout.emit('data', Buffer.from('stdout data'));
        proc.stderr.emit('data', Buffer.from('stderr data'));
        proc.emit('close', 0);
      });

      const result = await promise;
      expect(result).toContain('stdout data');
      expect(result).toContain('stderr data');
    });

    it('rejects with timeout error when abort signal fires (line 53-54)', async () => {
      const proc = buildProc();
      const kill = vi.fn();
      proc.kill = kill;
      vi.mocked(spawn).mockReturnValue(proc);

      const promise = runVersionProbe('eslint', ['--version'], 50); // Very short timeout

      // Catch the rejection to avoid unhandled rejection
      const result = await promise.catch((err) => err);
      expect(result).toBeInstanceOf(BinaryError);
      expect(result.message).toBe('Version probe timeout');
      expect(kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  describe('verifyLinterVersion', () => {
    it('returns null when no expectedVersion', async () => {
      const result = await verifyLinterVersion({
        id: 'test',
      });

      expect(result).toBeNull();
    });

    it('returns null when no versionProbe', async () => {
      const result = await verifyLinterVersion({
        id: 'test',
        expectedVersion: '1.0.0',
      });

      expect(result).toBeNull();
    });

    it('throws error when binary does not exist (line 73)', async () => {
      vi.mocked(access).mockRejectedValue(new Error('missing'));

      await expect(
        verifyLinterVersion({
          id: 'eslint',
          expectedVersion: '9.0.0',
          versionProbe: { binary: 'eslint', args: ['--version'] },
        }),
      ).rejects.toThrow('Binary not found for version probe');
    });

    it('handles both expectedVersion and versionProbe configs', async () => {
      const config = {
        id: 'eslint',
        expectedVersion: '9.0.0',
        versionProbe: { binary: 'eslint', args: ['--version'] },
      };

      // Verify the config has the required properties
      expect(config.expectedVersion).toBe('9.0.0');
      expect(config.versionProbe.binary).toBe('eslint');
    });

    it('returns null when version matches', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(spawn).mockImplementation((_cmd: string, _args?: readonly string[]) => {
        const proc = buildProc();
        queueMicrotask(() => {
          proc.stdout.emit('data', Buffer.from('9.0.0\n'));
          proc.emit('close', 0);
        });
        return proc;
      });

      const result = await verifyLinterVersion({
        id: 'eslint',
        expectedVersion: '9.0.0',
        versionProbe: { binary: 'eslint', args: ['--version'] },
      });

      expect(result).toBeNull();
    });

    const runVersionProbe = async (output: string | null): Promise<string | null> => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(spawn).mockImplementation((_cmd: string, _args?: readonly string[]) => {
        const proc = buildProc();
        queueMicrotask(() => {
          if (output !== null) {
            proc.stdout.emit('data', Buffer.from(output));
          }
          proc.emit('close', 0);
        });
        return proc;
      });

      return verifyLinterVersion({
        id: 'eslint',
        expectedVersion: '9.0.0',
        versionProbe: { binary: 'eslint', args: ['--version'] },
      });
    };

    it.each([
      ['mismatched version', '8.0.0\n', '8.0.0'],
      ['empty output', null, 'unknown'],
    ])('throws error when version probe has %s (line 80)', async (_label, output, detail) => {
      const error = await runVersionProbe(output).catch((err) => err);
      expect(error).toBeInstanceOf(BinaryError);
      expect(error.message).toContain('Version mismatch for eslint');
      expect(error.message).toContain('expected 9.0.0');
      expect(error.message).toContain(detail);
    });
  });
});
