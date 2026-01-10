/**
 * Political Sphere — CLI Argument Parsing
 *
 * Role:
 *   Handle all argument parsing, validation, and normalization.
 *
 * Responsibilities:
 *   - Parse raw argv into structured CLIArgs
 *   - Validate argument values
 *   - Map parse errors to descriptive CliErrors
 *   - Normalize raw values into typed structure
 */

import { parseArgs } from 'node:util';
import { CliError } from '../../errors/errors.ts';

/* -------------------------------------------------------------------------- */
/* CLI argument model                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Parsed CLI arguments normalized into strongly typed properties.
 */
export interface CLIArgs {
  readonly verifyLogs: boolean;
  readonly logDir: string;
  readonly linters?: readonly string[];
  readonly help: boolean;
  readonly version: boolean;
  readonly verbose: boolean;
  readonly incremental: boolean;
  readonly clearCache: boolean;
  readonly circuitBreaker: boolean;
  readonly structuredLogs: boolean;
}

/* -------------------------------------------------------------------------- */
/* Argument parsing                                                            */
/* -------------------------------------------------------------------------- */

/**
 *
 */
/**
 * Parse the raw argv array into structured CLI arguments.
 *
 * @param argv - Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns Normalized `CLIArgs`.
 * @throws {CliError} when parsing fails or validation rejects the inputs.
 */
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
        'circuit-breaker': { type: 'boolean', default: false },
        'structured-logs': { type: 'boolean', default: false },
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
  readonly 'circuit-breaker'?: boolean;
  readonly 'structured-logs'?: boolean;
};

/**
 *
 */
/**
 * Normalize the `parseArgs` output into our CLI shape and enforce validation rules.
 */
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
    circuitBreaker: Boolean(values['circuit-breaker']),
    structuredLogs: Boolean(values['structured-logs']),
  };
}

/**
 *
 */
/**
 * Translate `parseArgs` errors into `CliError` instances with user-friendly messages.
 */
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
