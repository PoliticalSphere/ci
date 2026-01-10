/**
 * Political Sphere — CLI Entrypoint
 *
 * Role:
 *   Handle process-level concerns (broken pipe, uncaught errors).
 *
 * Responsibilities:
 *   - Set up EPIPE error handling
 *   - Manage top-level error handling
 *   - Enable module self-execution detection
 */

import { pathToFileURL } from 'node:url';
import { executeWithArgs } from '../../execution/execution.ts';
import { parseCliArgs } from '../../input/args.ts';
import { showHelp } from '../help/formatter.ts';
import { showVersion } from '../help/help.ts';

export interface EntrypointDeps {
  readonly mainFn?: () => Promise<{ exitCode: number }>;
  readonly console?: Pick<typeof console, 'error'>;
  /** Optional graceful shutdown handler invoked on SIGINT/SIGTERM */
  readonly onSignal?: (signal: 'SIGINT' | 'SIGTERM') => Promise<void> | void;
}

/**
 * Handle EPIPE errors raised when piping output and terminate gracefully.
 *
 * @remarks
 * The handler swallows known EPIPE errors and rethrows others so standard
 * logging and CI failures bubble up.
 */
function handleBrokenPipe(err: NodeJS.ErrnoException): void {
  if (err?.code === 'EPIPE') {
    return; // Ignore and continue
  }

  throw err;
}

/**
 * Install handlers that invoke `handleBrokenPipe` when stdout or stderr errors.
 */
function setupBrokenPipeHandlers(): void {
  process.stdout.on('error', handleBrokenPipe);
  process.stderr.on('error', handleBrokenPipe);
}

/**
 * Register SIGINT/SIGTERM handlers and ensure they are removed after use.
 *
 * @param deps - Entrypoint dependencies potentially providing signal hooks.
 * @param errorConsole - Console used for logging warnings from signal handlers.
 * @returns Cleanup function that unregisters the signal listeners.
 */
function setupSignalHandlers(deps: EntrypointDeps, errorConsole: Pick<typeof console, 'error'>) {
  let handling = false;

  // Create per-signal handlers so the signal name is known deterministically
  const createHandler = (signal: 'SIGINT' | 'SIGTERM') => () => {
    if (handling) {
      return;
    }

    handling = true;

    if (deps.onSignal) {
      try {
        const maybe = deps.onSignal(signal);
        if (maybe && typeof maybe.then === 'function') {
          // allow the promise to settle but don't await here to avoid blocking
          maybe.catch((e) => errorConsole.error(`\nWARN: signal handler failed:`, e));
        }
      } catch (e) {
        errorConsole.error('\nWARN: signal handler failed:', e as Error);
      }
    } else {
      // No handler provided; process will exit with appropriate code
    }

    // Standard exit codes: SIGINT (2) -> 128 + 2 = 130, SIGTERM (15) -> 128 + 15 = 143
    const code = signal === 'SIGINT' ? 130 : 143;
    process.exitCode = code;
  };

  const sigintHandler = createHandler('SIGINT');
  const sigtermHandler = createHandler('SIGTERM');

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  return () => {
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
  };
}

/**
 * Execute the CLI entrypoint logic, wiring up broken pipes, signal handling,
 * and top-level error reporting.
 *
 * @param deps - Optional overrides for dependencies used during startup.
 */
export function runEntrypoint(deps: EntrypointDeps = {}): void {
  const { mainFn = main, console: injectedConsole } = deps;
  const errorConsole = injectedConsole ?? console;

  setupBrokenPipeHandlers();
  const removeSignalHandlers = setupSignalHandlers(deps, errorConsole);

  // Chain directly off the returned promise so the runtime does not
  // need to hold an extra reference and lint rules about promise handling
  // are satisfied.
  void mainFn()
    .catch(async (error: unknown) => {
      // Construct a lightweight, synchronous wrapper object so tests and runtime
      // observers receive a deterministic AppError-like object immediately.
      type WrappedSyncError = Error & {
        code?: string;
        cause?: unknown;
        details?: { context: { argv: string[] } };
      };
      const wrappedSync: WrappedSyncError = Object.assign(
        new Error(error instanceof Error ? error.message : String(error)),
        {
          code: 'UNEXPECTED_ERROR',
          name: 'AppError',
          cause: error,
          details: { context: { argv: sanitizeArgs(process.argv.slice(2)) } },
        },
      );

      // Emit the wrapped error synchronously to ensure deterministic test output
      // even under concurrent test execution.
      errorConsole.error('\n❌ Fatal error:', wrappedSync);
      process.exitCode = 1;

      // Also attempt to build and log a real AppError asynchronously so runtime
      // behavior remains rich in non-test environments. We import lazily to avoid
      // module cycles in some test setups.
      try {
        const { AppError } = await import('../../../errors/errors.ts');

        const wrapped = new AppError(
          'UNEXPECTED_ERROR',
          error instanceof Error ? error.message : String(error),
          {
            cause: error,
            details: { context: { argv: sanitizeArgs(process.argv.slice(2)) } },
          },
        );

        errorConsole.error('\n❌ Fatal error:', wrapped);
      } catch {
        // If dynamic import fails (e.g., due to module cycles in some test setups),
        // we already emitted a deterministic wrapper above, so ignore import failures.
      }
    })
    .finally(() => {
      // Cleanup signal handlers after main completes so tests can deterministically
      // verify handlers are installed and removed.
      try {
        removeSignalHandlers();
      } catch {
        // ignore cleanup errors
      }
    });
}

/**
 * Scrub argv values for logging to avoid leaking secrets.
 *
 * @param argv - Raw argument list to sanitize.
 * @returns Sanitized string array with sensitive values replaced by `<redacted>`.
 */
function sanitizeArgs(argv: Array<string | undefined>): string[] {
  return argv.map((arg) => {
    if (typeof arg !== 'string') {
      return '<redacted>';
    }

    if (arg.startsWith('--')) {
      // Mask long form flags' values while keeping the flag name
      const [key, val] = arg.split('=', 2);
      return val === undefined ? key : `${key}=<redacted>`;
    }
    if (arg.startsWith('-')) {
      // Short flags are safe to show
      return arg;
    }
    // Positional or unprefixed args may contain sensitive data; redact them
    return '<redacted>';
  }) as string[];
}

/**
 * Main entrypoint implementation invoked by `runEntrypoint`.
 *
 * This function is exported indirectly via `runEntrypoint` so it can be
 * mocked during tests while allowing `runEntrypoint` to apply signal handling.
 *
 * @returns Execution result including exit code when the CLI finishes.
 */
async function main(): Promise<{ exitCode: number }> {
  const argv = process.argv.slice(2);
  const args = parseCliArgs(argv);

  if (args.version) {
    console.log(showVersion());
    return { exitCode: 0 };
  }

  if (args.help) {
    console.log(showHelp());
    return { exitCode: 0 };
  }

  return executeWithArgs(args);
}

/* -------------------------------------------------------------------------- */
/* Module self-execution detection                                            */
/* -------------------------------------------------------------------------- */

/**
 * Detect when this module is executed directly (node entrypoint) and run.
 */
const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;

if (entryUrl !== null && import.meta.url === entryUrl) {
  runEntrypoint();
}
