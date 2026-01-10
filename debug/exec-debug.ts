import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function mkdtemp(prefix: string) {
  const dir = await import('node:fs/promises').then((m) => m.mkdtemp(prefix));
  return dir;
}

async function run() {
  const { executeWithArgs } = await import('../src/cli/execution/execution.ts');
  const errorCalls: unknown[] = [];
  const errorSpy = (...args: unknown[]) => errorCalls.push(args);
  const args = {
    verifyLogs: false,
    logDir: './logs',
    linters: ['eslint'],
    help: false,
    version: false,
    verbose: false,
    incremental: false,
    clearCache: false,
  };

  const result = await executeWithArgs(args, {
    cwd: await mkdtemp(path.join(tmpdir(), 'ps-ci-exec-')),
    mkdirFn: () => Promise.resolve(),
    writeFileFn: () => Promise.reject(new Error('disk full')),
    renameFn: () => Promise.resolve(),
    acquireExecutionLockFn: () =>
      Promise.resolve({
        lockPath: path.join(process.cwd(), 'lock'),
        release: () => Promise.resolve(),
      }),
    renderDashboardFn: () => ({
      updateStatus: () => {},
      waitForExit: () => Promise.resolve(),
    }),
    renderWaitingHeaderFn: () => ({
      unmount: () => {},
    }),
    executeLintersFn: () => Promise.resolve([]),
    calculateSummaryFn: () => ({ total: 0, passed: 0, failed: 0, errors: 0, duration: 0 }),
    console: {
      log: () => {},
      error: errorSpy,
    } as unknown as typeof console,
  });

  console.log('RESULT', result);
  console.log('ERROR CALLS', errorCalls);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdtemp(path.join(tmpdir(), 'ps-debug-')).catch(() => null);
  run().catch((e) => {
    console.error('ERR', e);
    throw e;
  });
}
