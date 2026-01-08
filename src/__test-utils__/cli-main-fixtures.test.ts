/**
 * Political Sphere — CLI Test Fixtures — Tests
 *
 * Role:
 *   Unit tests for the `createMainTestDeps` helpers in
 *   `src/__test-utils__/cli-main-fixtures.ts`.
 *
 * Notes:
 *   - Verifies that mock factories and bundled options behave as expected.
 */

import { describe, expect, it, vi } from 'vitest';

import { createMainTestDeps } from './cli-main-fixtures.ts';

describe('CLI test utils', () => {
  it('creates dependencies without injecting console', async () => {
    const {
      options,
      mkdirFn,
      renderDashboardFn,
      renderWaitingHeaderFn,
      executeLintersFn,
      calculateSummaryFn,
      acquireExecutionLockFn,
    } = createMainTestDeps(['--foo']);

    expect(options.console).toBeUndefined();

    await mkdirFn('/tmp/logs', { recursive: true });

    const dashboard = renderDashboardFn();
    dashboard.updateStatus('running');
    await dashboard.waitForExit();

    const waiting = renderWaitingHeaderFn();
    waiting.unmount();

    const summary = calculateSummaryFn();
    expect(summary.total).toBe(1);

    const lock = await acquireExecutionLockFn();
    await lock.release();

    const results = await executeLintersFn([], { logDir: '/tmp/logs' });
    expect(results[0]?.logPath).toBe('/tmp/logs/eslint.log');
  });

  it('includes injected console and lock helpers', async () => {
    const fakeConsole = { log: vi.fn() };
    const { options, acquireExecutionLockFn } = createMainTestDeps([], fakeConsole);

    expect(options.console).toBe(fakeConsole);

    const lock = await acquireExecutionLockFn();
    expect(lock.lockPath).toBe('/tmp/ps-parallel-lint.lock');
    await lock.release();
  });
});
