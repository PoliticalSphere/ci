/**
 * Political Sphere — Parallel Linter CLI
 *
 * Role:
 *   High-speed orchestration layer for executing security and code linters
 *   in parallel with deterministic logging and auditable outcomes.
 *
 * Authority:
 *   - This CLI orchestrates only.
 *   - Linter behaviour is defined in the registry.
 *   - Policy decisions are enforced by CI.
 *
 * Principles:
 *   - Fail fast on invalid input
 *   - Deterministic execution and exit codes
 *   - No implicit behaviour
 *   - Local execution mirrors CI semantics
 */

// Config re-exports
export {
  getAllLinterIds,
  getLinterById,
  LINTER_REGISTRY,
  type LinterConfig,
} from '../config/index.ts';
// Execution re-exports
export {
  acquireExecutionLock,
  calculateSummary,
  type ExecutionLock,
  type ExecutionSummary,
  executeLinter,
  executeLintersInParallel,
  executeWithArgs,
  type LinterResult,
  type LinterStatus,
  type MainDeps,
  type MainResult,
} from '../execution/index.ts';
// Infrastructure re-exports
export {
  disableCaching,
  disableIncrementalExecution,
  enableCaching,
  enableIncrementalExecution,
} from '../infrastructure/index.ts';
// Input handling re-exports
export {
  type CLIArgs,
  ensureSafeDirectoryPath,
  parseCliArgs,
  resolveLinters,
} from '../input/index.ts';
// Observability re-exports
export {
  appendToLog,
  createChildTraceContext,
  createLogger,
  createTraceContext,
  getGlobalTelemetry,
  makeLogOptions,
  resetGlobalTelemetry,
  TelemetryCollector,
  type TraceContext,
} from '../observability/index.ts';
// Output re-exports
export { renderDashboard, renderWaitingHeader, WAITING_HEADER_MESSAGE } from '../output/index.ts';
// Core exports
export { type EntrypointDeps, runEntrypoint } from './entrypoint/entrypoint.ts';
export { showHelp } from './help/formatter.ts';
export { showVersion } from './help/help.ts';

// Backward compatibility: main is an alias for executeWithArgs with args parsing
import { executeWithArgs, type MainDeps, type MainResult } from '../execution/index.ts';
import { parseCliArgs } from '../input/index.ts';
import { showHelp } from './help/formatter.ts';
import { showVersion } from './help/help.ts';

/**
 * Entry point used by CLI integrations and tests; it parses args, handles
 * help/version flags, and delegates to `executeWithArgs`.
 *
 * @param deps - Optional dependencies such as custom argv, console, or execution hooks.
 * @returns The execution result containing the exit code and summary data.
 */
export async function main(deps: MainDeps = {}): Promise<MainResult> {
  const { argv = process.argv.slice(2), console: injectedConsole, ...rest } = deps;
  const args = parseCliArgs(argv);

  // Handle help and version early
  if (args.help) {
    (injectedConsole ?? console).log(showHelp());
    return { exitCode: 0 };
  }

  if (args.version) {
    (injectedConsole ?? console).log(showVersion());
    return { exitCode: 0 };
  }

  return executeWithArgs(args, {
    ...(injectedConsole ? { console: injectedConsole } : {}),
    ...rest,
  });
}
