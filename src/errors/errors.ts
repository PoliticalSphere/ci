/**
 * Shared error hierarchy for consistent error handling.
 */

export type ErrorCode =
  | 'CLI_ABORTED'
  | 'CLI_INVALID_ARGUMENT'
  | 'CLI_UNKNOWN_OPTION'
  | 'CLI_PARSE_ERROR'
  | 'CLI_INVALID_PATH'
  | 'EXECUTION_LOCK_ACQUIRE_FAILED'
  | 'EXECUTION_LOCK_RELEASE_FAILED'
  | 'PROCESS_ABORTED'
  | 'PROCESS_SPAWN_FAILED'
  | 'PROCESS_TIMEOUT'
  | 'BINARY_NOT_FOUND'
  | 'BINARY_VERSION_MISMATCH'
  | 'BINARY_VERSION_PROBE_FAILED'
  | 'BINARY_VERSION_PROBE_TIMEOUT'
  | 'CONFIG_INVALID_PATTERN'
  | 'INVALID_LINTER_ID'
  | 'UNEXPECTED_ERROR';

/**
 * Error details for CLI operations.
 */
export interface CliErrorDetails {
  /** The file path involved in the error, if applicable */
  readonly filePath?: string;
  /** The command or operation that failed */
  readonly command?: string;
  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;
}

/**
 * Error details for execution lock operations.
 */
export interface ExecutionLockErrorDetails {
  /** The lock timeout in milliseconds */
  readonly timeoutMs: number;
  /** The operation that was being performed */
  readonly operation?: string;
}

/**
 * Error details for process operations.
 */
export interface ProcessErrorDetails {
  /** The process exit code, if available */
  readonly exitCode?: number;
  /** The command that was executed */
  readonly command: string;
  /** Any stdout output from the process */
  readonly stdout?: string;
  /** Any stderr output from the process */
  readonly stderr?: string;
}

/**
 * Error details for binary operations.
 */
export interface BinaryErrorDetails {
  /** The name of the binary that failed */
  readonly binaryName: string;
  /** The expected version, if applicable */
  readonly expectedVersion?: string;
  /** The actual version found, if applicable */
  readonly actualVersion?: string;
}

export interface ErrorDetails {
  readonly [key: string]: unknown;
}

/**
 *
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  public override cause?: unknown;

  /**
   *
   */
  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: unknown; details?: ErrorDetails },
  ) {
    super(message);
    this.code = code;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
    // Chain stack traces when cause is an Error for better debugging
    if (options?.cause instanceof Error) {
      // Set the cause while maintaining compatibility
      this.cause = options.cause;
      // If we don't already have a meaningful stack, use the cause's stack
      const currentStack = this.stack;
      const causeStack = options.cause.stack;
      if (
        (currentStack === undefined || currentStack === '') &&
        causeStack !== undefined &&
        causeStack !== ''
      ) {
        this.stack = String(causeStack);
      }
    } else if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    this.name = this.constructor.name;
  }
}

/**
 *
 */
export class CliError extends AppError {}
/**
 *
 */
export class ExecutionLockError extends AppError {}
/**
 *
 */
export class ProcessError extends AppError {}
/**
 *
 */
export class BinaryError extends AppError {}

/**
 * Format an arbitrary error into a concise string for logging or display.
 *
 * @param {unknown} error - The error value to format (may be an Error, AppError, or other).
 * @returns {string} A short string representation of the error.
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Narrow an unknown value to an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Narrow an unknown value to a ProcessError.
 */
export function isProcessError(error: unknown): error is ProcessError {
  return error instanceof ProcessError;
}

/**
 * Check whether an unknown value has the given property name.
 * Useful before accessing properties on caught errors.
 */
export function hasErrorProperty<T extends string>(
  error: unknown,
  prop: T,
): error is Record<T, unknown> {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.has(error as Record<string, unknown>, prop)
  );
}
