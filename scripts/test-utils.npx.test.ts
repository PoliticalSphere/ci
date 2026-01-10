/**
 * Tests for npx execution path in script helpers.
 */

import { inspect, promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runScript (npx path)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('node:child_process');
  });

  it('uses npx for non-.sh scripts', async () => {
    const execFile = vi.fn((...callArgs: unknown[]) => {
      const cb = callArgs.at(-1);
      if (typeof cb === 'function') {
        (cb as (err: unknown, stdout: string, stderr: string) => void)(null, 'ok', '');
      }
    });
    (
      execFile as {
        [key: symbol]: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
      }
    )[promisify.custom] = (cmd, args) =>
      new Promise((resolve, reject) => {
        execFile(cmd, args, (err: unknown, stdout: string, stderr: string) => {
          if (err) {
            // Ensure Promise rejections are Error instances for eslint rule
            let errMsg: string;
            if (typeof err === 'string') {
              errMsg = err;
            } else if (err instanceof Error) {
              errMsg = err.message;
            } else if (typeof err === 'object' && err != null) {
              try {
                errMsg = JSON.stringify(err);
              } catch {
                errMsg = inspect(err, { depth: 2 });
              }
            } else {
              errMsg = inspect(err, { depth: 2 });
            }
            reject(err instanceof Error ? err : new Error(errMsg));
          } else {
            resolve({ stdout, stderr });
          }
        });
      });

    vi.doMock('node:child_process', () => ({ execFile }));

    const { runScript } = await import('./test-utils.ts');
    const result = await runScript('script.js', ['--flag']);

    expect(execFile).toHaveBeenCalledWith('npx', ['script.js', '--flag'], expect.any(Function));
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('uses npx with env for non-.sh scripts', async () => {
    const execFile = vi.fn(
      (
        _cmd: string,
        _args: string[],
        _options: { env?: Record<string, string> },
        cb: (err: unknown, stdout: string, stderr: string) => void,
      ) => {
        cb(null, 'ok', '');
      },
    );

    vi.doMock('node:child_process', () => ({ execFile }));

    const { runScriptWithEnv } = await import('./test-utils.ts');
    const result = await runScriptWithEnv('script.js', ['--flag'], { FOO: 'bar' });

    expect(execFile).toHaveBeenCalledWith(
      'npx',
      ['script.js', '--flag'],
      expect.objectContaining({ env: expect.objectContaining({ FOO: 'bar' }) }),
      expect.any(Function),
    );
    expect(result.code).toBe(0);
  });
});
