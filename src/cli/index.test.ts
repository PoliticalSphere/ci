/**
 * Tests for the CLI top-level module.
 *
 * These tests verify the CLI `index` module:
 *   - decides whether to self-execute based on `process.argv`
 *   - keeps all public helper barrels re-exported through `./index.ts`
 *
 * Helpers below mock `./core/index.ts` and temporarily replace `process.argv`
 * so the module may be imported deterministically.
 */
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendToLog,
  createLogger,
  createTraceContext,
  enableCaching,
  enableIncrementalExecution,
  ensureSafeDirectoryPath,
  executeWithArgs,
  getAllLinterIds,
  getGlobalTelemetry,
  LINTER_REGISTRY,
  parseCliArgs,
  renderDashboard,
  renderWaitingHeader,
  resolveLinters,
  WAITING_HEADER_MESSAGE,
} from './index.ts';

/**
 * Import `src/cli/index.ts` under controlled `process.argv` and with
 * `./core/index.ts` mocked. Returns the module and spies so tests can
 * assert whether the CLI decided to self-execute.
 */
const loadWithArgs = async (argv: string[]) => {
  vi.resetModules();
  const runEntrypoint = vi.fn();
  const executeWithArgs = vi.fn();
  vi.doMock('./core/index.ts', () => ({
    runEntrypoint,
    executeWithArgs,
  }));
  const originalArgv = process.argv;
  process.argv = argv;
  const mod = await import('./index.ts');
  return { mod, runEntrypoint, executeWithArgs, originalArgv };
};

describe('cli index', () => {
  afterEach(() => {
    vi.doUnmock('./core/index.ts');
  });

  it('does not run entrypoint when argv[1] is missing', async () => {
    const { runEntrypoint, originalArgv } = await loadWithArgs(['node']);

    expect(runEntrypoint).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  it('runs entrypoint when argv[1] matches module path', async () => {
    const modulePath = fileURLToPath(new URL('index.ts', import.meta.url));
    const { runEntrypoint, mod, executeWithArgs, originalArgv } = await loadWithArgs([
      'node',
      modulePath,
    ]);

    expect(runEntrypoint).toHaveBeenCalledTimes(1);
    expect(mod.executeWithArgs).toBe(executeWithArgs);
    process.argv = originalArgv;
  });
});

describe('cli index barrel exports', () => {
  it('re-exports config helpers', () => {
    expect(Array.isArray(LINTER_REGISTRY)).toBe(true);
    expect(typeof getAllLinterIds).toBe('function');
  });

  it('re-exports execution helpers', () => {
    expect(typeof executeWithArgs).toBe('function');
  });

  it('re-exports infrastructure helpers', () => {
    expect(typeof enableCaching).toBe('function');
    expect(typeof enableIncrementalExecution).toBe('function');
  });

  it('re-exports input helpers', () => {
    expect(typeof parseCliArgs).toBe('function');
    expect(typeof resolveLinters).toBe('function');
    expect(typeof ensureSafeDirectoryPath).toBe('function');
  });

  it('re-exports observability helpers', () => {
    expect(typeof appendToLog).toBe('function');
    expect(typeof createLogger).toBe('function');
    expect(typeof getGlobalTelemetry).toBe('function');
    expect(typeof createTraceContext).toBe('function');
  });

  it('re-exports output helpers', () => {
    expect(typeof renderDashboard).toBe('function');
    expect(typeof renderWaitingHeader).toBe('function');
    expect(typeof WAITING_HEADER_MESSAGE).toBe('string');
  });
});
