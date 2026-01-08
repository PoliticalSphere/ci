#!/usr/bin/env node
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

import { Console } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { CliError } from '../errors.ts';
import { disableCaching, enableCaching } from './cache.ts';
import { acquireExecutionLock } from './execution-lock.ts';
import {
  calculateSummary,
  type ExecutionSummary,
  executeLintersInParallel,
  type LinterStatus,
} from './executor.ts';
import { disableIncrementalExecution, enableIncrementalExecution } from './incremental.ts';
import { getAllLinterIds, getLinterById, LINTER_REGISTRY, type LinterConfig } from './linters.ts';
import { getGlobalTelemetry } from './telemetry.ts';
import { createTraceContext } from './tracing.ts';
import { renderDashboard, renderWaitingHeader, WAITING_HEADER_MESSAGE } from './ui.tsx';

/* -------------------------------------------------------------------------- */
/* CLI argument model                                                          */
/* -------------------------------------------------------------------------- */

export interface CLIArgs {
  readonly verifyLogs: boolean;
  readonly logDir: string;
  readonly linters?: readonly string[];
  readonly help: boolean;
  readonly version: boolean;
  readonly verbose: boolean;
  readonly incremental: boolean;
  readonly clearCache: boolean;
}

/* -------------------------------------------------------------------------- */
/* Argument parsing                                                            */
/* -------------------------------------------------------------------------- */

export function parseCliArgs(argv: readonly string[] = process.argv.slice(2)): CLIArgs {
  const sanitizedArgv = argv.filter((arg): arg is string => typeof arg === 'string');

  try {
    const { values, positionals } = parseArgs({
      args: sanitizedArgv,
      strict: true,
      allowPositionals: true,
      options: {
        'verify-logs': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
        'log-dir': { type: 'string', default: './logs' },
        linters: { type: 'string', multiple: true },
        verbose: { type: 'boolean', default: false },
        debug: { type: 'boolean', default: false },
        incremental: { type: 'boolean', default: false },
        'clear-cache': { type: 'boolean', default: false },
      },
    });

    return normalizeCliArgs(values, positionals);
  } catch (error) {
    throw mapParseArgsError(error);
  }
}

type RawCliValues = {
  readonly 'verify-logs'?: boolean;
  readonly help?: boolean;
  readonly version?: boolean;
  readonly 'log-dir'?: string;
  readonly linters?: readonly string[];
  readonly verbose?: boolean;
  readonly debug?: boolean;
  readonly incremental?: boolean;
  readonly 'clear-cache'?: boolean;
};

function normalizeCliArgs(values: RawCliValues, positionals: readonly string[]): CLIArgs {
  if (positionals.length > 0) {
    throw new CliError('CLI_INVALID_ARGUMENT', `Unexpected argument: ${positionals[0]}`);
  }

  const logDir = values['log-dir'] as string;
  if (logDir.trim().length === 0) {
    throw new CliError('CLI_INVALID_ARGUMENT', '--log-dir requires a path');
  }

  const linters = values.linters
    ?.flatMap((entry) => entry.split(',').map((id) => id.trim()))
    .filter((id) => id.length > 0);

  if (values.linters !== undefined && (!linters || linters.length === 0)) {
    throw new CliError('CLI_INVALID_ARGUMENT', '--linters requires at least one linter id');
  }

  return {
    verifyLogs: Boolean(values['verify-logs']),
    logDir,
    ...(linters && linters.length > 0 ? { linters: linters as readonly string[] } : {}),
    help: Boolean(values.help),
    version: Boolean(values.version),
    verbose: values.verbose === true || values.debug === true,
    incremental: Boolean(values.incremental),
    clearCache: Boolean(values['clear-cache']),
  };
}

function mapParseArgsError(error: unknown): Error {
  if (error instanceof Error && 'code' in error) {
    const code = (error as { code?: string }).code;
    const optionFromError = (error as { option?: string }).option;
    const optionFromMessage = /'([\w-]+)/.exec(error.message)?.[1];
    const option = optionFromError ?? optionFromMessage;

    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      return new CliError('CLI_UNKNOWN_OPTION', `Unknown option: ${option ?? error.message}`, {
        cause: error,
      });
    }

    if (
      code === 'ERR_PARSE_ARGS_MISSING_VALUE' ||
      code === 'ERR_PARSE_ARGS_MISSING_VALUES' ||
      code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE'
    ) {
      if (option === '--log-dir') {
        return new CliError('CLI_INVALID_ARGUMENT', '--log-dir requires a path', {
          cause: error,
        });
      }

      if (option === '--linters') {
        return new CliError('CLI_INVALID_ARGUMENT', '--linters requires at least one linter id', {
          cause: error,
        });
      }
    }
  }

  if (error instanceof Error) {
    return new CliError('CLI_PARSE_ERROR', error.message, { cause: error });
  }
  return new CliError('CLI_PARSE_ERROR', String(error));
}

/* -------------------------------------------------------------------------- */
/* Help output                                                                 */
/* -------------------------------------------------------------------------- */

export function showHelp(): string {
  return `
Political Sphere — Parallel Linter CLI

USAGE:
  ps-lint [OPTIONS]

OPTIONS:
  --verify-logs         Enable raw byte-for-byte logging (verification mode)
  --log-dir <path>      Directory for log files (default: ./logs)
  --linters <list>      Comma- or space-separated list of linters to run
                        Available: ${getAllLinterIds().join(', ')}
  --incremental         Only run linters for changed files (git-aware)
  --clear-cache         Clear all caches before execution
  --verbose             Enable verbose logging (alias: --debug)
  --help                Show this help message
  --version             Show version number

EXAMPLES:
  ps-lint
  ps-lint --verify-logs
  ps-lint --linters gitleaks,biome,eslint
  ps-lint --incremental
  ps-lint --clear-cache
  ps-lint --log-dir ./build/lint-logs

NOTES:
  • Parallel execution uses N-1 CPU cores
  • Incremental mode requires a git repository
  • CI execution is authoritative
  • Logs are deterministic and auditable
`;
}

export function showVersion(): string {
  return '@politicalsphere/ci v0.0.1';
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export function resolveLinters(input?: readonly string[]): readonly LinterConfig[] {
  if (!input || input.length === 0) {
    return LINTER_REGISTRY;
  }

  const requested = input.flatMap((s) => s.split(',').map((id) => id.trim()));
  if (requested.some((id) => id.length === 0)) {
    throw new CliError('CLI_INVALID_ARGUMENT', 'Empty linter IDs are not allowed');
  }

  const valid = new Set(getAllLinterIds());
  const invalid = requested.filter((id) => !valid.has(id));

  if (invalid.length > 0) {
    throw new CliError(
      'CLI_INVALID_ARGUMENT',
      `Invalid linter IDs: ${invalid.join(', ')}\nValid linters: ${[...valid].join(', ')}`,
    );
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of requested) {
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }

  if (duplicates.size > 0) {
    throw new CliError(
      'CLI_INVALID_ARGUMENT',
      `Duplicate linter IDs: ${[...duplicates].join(', ')}`,
    );
  }

  return requested
    .map((id) => getLinterById(id))
    .filter((linter): linter is NonNullable<typeof linter> => linter != null);
}

export function ensureSafeDirectoryPath(baseDir: string, inputPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, inputPath);
  const relativePath = path.relative(resolvedBase, resolvedPath);

  const isOutside =
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (isOutside) {
    throw new CliError('CLI_INVALID_PATH', `Log directory must be within ${resolvedBase}`, {
      details: { resolvedBase, inputPath },
    });
  }

  return resolvedPath;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

export interface MainDeps {
  readonly argv?: readonly string[];
  readonly mkdirFn?: typeof mkdir;
  readonly writeFileFn?: typeof writeFile;
  readonly renderDashboardFn?: typeof renderDashboard;
  readonly renderWaitingHeaderFn?: typeof renderWaitingHeader;
  readonly executeLintersFn?: typeof executeLintersInParallel;
  readonly calculateSummaryFn?: typeof calculateSummary;
  readonly acquireExecutionLockFn?: typeof acquireExecutionLock;
  readonly cwd?: string;
  readonly lockPath?: string;
  readonly console?: typeof console;
}

export interface MainResult {
  readonly exitCode: number;
  readonly summary?: ExecutionSummary;
}

/* eslint-disable-next-line sonarjs/cognitive-complexity */
export async function main(deps: MainDeps = {}): Promise<MainResult> {
  const {
    argv = process.argv.slice(2),
    mkdirFn = mkdir,
    writeFileFn = writeFile,
    renderDashboardFn = renderDashboard,
    renderWaitingHeaderFn = renderWaitingHeader,
    executeLintersFn = executeLintersInParallel,
    calculateSummaryFn = calculateSummary,
    acquireExecutionLockFn = acquireExecutionLock,
    cwd = process.cwd(),
    lockPath,
    console: injectedConsole,
  } = deps;

  const stdout = process.stdout;
  const stderr = process.stderr;
  const scopedConsole = injectedConsole ?? new Console({ stdout, stderr });
  const log = scopedConsole.log.bind(scopedConsole);
  const error = scopedConsole.error.bind(scopedConsole);
  let releaseLock: (() => Promise<void>) | undefined;
  let waitingView: { unmount: () => void } | undefined;
  let rootTrace: ReturnType<typeof createTraceContext> | undefined;
  let telemetryCollector: ReturnType<typeof getGlobalTelemetry> | undefined;
  let logDirForTelemetry: string | undefined;

  try {
    const args = parseCliArgs(argv);

    if (args.version) {
      log(showVersion());
      return { exitCode: 0 };
    }

    if (args.help) {
      log(showHelp());
      return { exitCode: 0 };
    }

    // Initialize caching
    if (args.clearCache) {
      disableCaching();
      log('ℹ️  Caching disabled (--clear-cache flag set)\n');
    } else {
      enableCaching();
    }

    // Initialize incremental execution
    if (args.incremental) {
      enableIncrementalExecution();
      log('ℹ️  Incremental execution enabled (--incremental flag set)\n');
    } else {
      disableIncrementalExecution();
    }

    const lintersToRun = resolveLinters(args.linters);
    const logDir = ensureSafeDirectoryPath(cwd, args.logDir);
    // Prepare root trace and telemetry collector for this CLI execution
    rootTrace = createTraceContext();
    telemetryCollector = getGlobalTelemetry();
    logDirForTelemetry = logDir;

    const executionLock = await acquireExecutionLockFn({
      lockPath,
      onWaitStart: () => {
        waitingView = renderWaitingHeaderFn(WAITING_HEADER_MESSAGE, { stdout, stderr });
      },
      onWaitEnd: () => {
        waitingView?.unmount();
        waitingView = undefined;
      },
    });
    releaseLock = executionLock.release;

    // Fail early before side effects
    await mkdirFn(logDir, { recursive: true });

    log('🚀 Political Sphere Parallel Linter\n');
    log(`Linters: ${lintersToRun.length}`);
    log(`Log directory: ${logDir}`);
    log(`Verification mode: ${args.verifyLogs ? 'ENABLED' : 'DISABLED'}`);
    if (args.verbose) {
      log(`Verbose mode: ENABLED`);
      log(`Working directory: ${cwd}`);
      log(`Requested linters: ${args.linters?.join(', ') ?? 'all'}`);
    }
    log('');

    const dashboard = renderDashboardFn(lintersToRun, logDir, { stdout, stderr });
    const updateStatus = (id: string, status: LinterStatus) => dashboard.updateStatus(id, status);
    const waitForExit = () => dashboard.waitForExit();
    const startTime = Date.now();

    const results = await executeLintersFn(lintersToRun, {
      logDir,
      verifyMode: args.verifyLogs,
      incremental: args.incremental,
      traceContext: rootTrace,
      telemetry: telemetryCollector,
      onStatusChange: (id: string, status: LinterStatus) => {
        updateStatus(id, status);
      },
    });

    await waitForExit();

    const summary = calculateSummaryFn(results, Date.now() - startTime);

    if (summary.errors > 0 || summary.failed > 0) {
      error('\n❌ Linting failed');
      process.exitCode = 1;
      return { exitCode: 1, summary };
    }

    log('\n✅ All linters passed');
    process.exitCode = 0;
    return { exitCode: 0, summary };
  } catch (err) {
    error('\n❌ Fatal error:', err);
    process.exitCode = 1;
    return { exitCode: 1 };
  } finally {
    if (waitingView) {
      waitingView.unmount();
      waitingView = undefined;
    }
    if (releaseLock) {
      try {
        await releaseLock();
      } catch (releaseError) {
        error('\nWARN: Failed to release execution lock:', releaseError);
      }
    }
    // Export telemetry to the log directory (best-effort)
    if (telemetryCollector && logDirForTelemetry !== undefined) {
      try {
        const out = telemetryCollector.export();
        await writeFileFn(
          path.join(logDirForTelemetry, 'telemetry.json'),
          JSON.stringify(out, null, 2),
          'utf8',
        );
      } catch (writeErr) {
        error('\nWARN: Failed to write telemetry.json:', writeErr);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Entrypoint                                                                  */
/* -------------------------------------------------------------------------- */

// Silently ignore EPIPE errors so the process continues to completion
// even when piped through head/tail
function handleBrokenPipe(err: NodeJS.ErrnoException): void {
  if (err?.code === 'EPIPE') {
    return; // Ignore and continue
  }

  throw err;
}

function setupBrokenPipeHandlers(): void {
  process.stdout.on('error', handleBrokenPipe);
  process.stderr.on('error', handleBrokenPipe);
}

export interface EntrypointDeps {
  readonly mainFn?: () => Promise<MainResult>;
  readonly console?: Pick<typeof console, 'error'>;
}

export function runEntrypoint(deps: EntrypointDeps = {}): void {
  const { mainFn = main, console: injectedConsole } = deps;
  const errorConsole = injectedConsole ?? console;

  setupBrokenPipeHandlers();
  mainFn().catch((error) => {
    errorConsole.error('\n❌ Fatal error:', error);
    process.exitCode = 1;
  });
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;

if (entryUrl !== null && import.meta.url === entryUrl) {
  runEntrypoint();
}
