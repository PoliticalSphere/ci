/**
 * Shared error hierarchy for consistent error handling.
 */

export type ErrorCode =
  | 'CLI_INVALID_ARGUMENT'
  | 'CLI_UNKNOWN_OPTION'
  | 'CLI_PARSE_ERROR'
  | 'CLI_INVALID_PATH'
  | 'EXECUTION_LOCK_ACQUIRE_FAILED'
  | 'EXECUTION_LOCK_RELEASE_FAILED'
  | 'PROCESS_SPAWN_FAILED'
  | 'PROCESS_TIMEOUT'
  | 'BINARY_NOT_FOUND'
  | 'BINARY_VERSION_MISMATCH'
  | 'BINARY_VERSION_PROBE_FAILED'
  | 'BINARY_VERSION_PROBE_TIMEOUT'
  | 'UNKNOWN';

export interface ErrorDetails {
  readonly [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;

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
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    this.name = this.constructor.name;
  }
}

export class CliError extends AppError {}
export class ExecutionLockError extends AppError {}
export class ProcessError extends AppError {}
export class BinaryError extends AppError {}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
