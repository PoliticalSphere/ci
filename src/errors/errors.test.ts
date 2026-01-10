/**
 * Tests for shared error hierarchy.
 */

import { describe, expect, it } from 'vitest';

import {
  AppError,
  BinaryError,
  CliError,
  ExecutionLockError,
  formatErrorMessage,
  hasErrorProperty,
  isAppError,
  isProcessError,
  ProcessError,
} from './errors.ts';

describe('errors', () => {
  it('constructs AppError with code, message, name, and optional metadata', () => {
    const cause = new Error('root cause');
    const details = { field: 'value' };
    const err = new AppError('CLI_PARSE_ERROR', 'Parse failed', { cause, details });

    expect(err.code).toBe('CLI_PARSE_ERROR');
    expect(err.message).toBe('Parse failed');
    expect(err.name).toBe('AppError');
    expect(err.details).toEqual(details);
    expect((err as { cause?: unknown }).cause).toBe(cause);
  });

  it('constructs AppError without metadata', () => {
    const err = new AppError('UNEXPECTED_ERROR', 'Unknown failure');

    expect(err.code).toBe('UNEXPECTED_ERROR');
    expect(err.message).toBe('Unknown failure');
    expect(err.details).toBeUndefined();
  });

  it('uses cause stack when its own stack is empty', () => {
    const originalPrepare = Error.prepareStackTrace;
    (Error.prepareStackTrace as unknown as (
      err: Error,
      stackTraces: unknown[],
    ) => string | undefined) = () => '';

    try {
      const cause = new Error('root cause');
      cause.stack = 'cause-stack';
      const err = new AppError('CLI_PARSE_ERROR', 'Parse failed', { cause });

      expect(err.stack).toBe('cause-stack');
    } finally {
      Error.prepareStackTrace = originalPrepare;
    }
  });

  it('supports inheritance for domain errors', () => {
    const err = new CliError('CLI_INVALID_ARGUMENT', 'Bad input');
    const lockErr = new ExecutionLockError('EXECUTION_LOCK_RELEASE_FAILED', 'Lock release failed');
    const procErr = new ProcessError('PROCESS_TIMEOUT', 'Timeout exceeded');
    const binErr = new BinaryError('BINARY_NOT_FOUND', 'Binary missing');

    expect(err).toBeInstanceOf(AppError);
    expect(lockErr).toBeInstanceOf(AppError);
    expect(procErr).toBeInstanceOf(AppError);
    expect(binErr).toBeInstanceOf(AppError);
    expect(err.code).toBe('CLI_INVALID_ARGUMENT');
    expect(lockErr.code).toBe('EXECUTION_LOCK_RELEASE_FAILED');
    expect(procErr.code).toBe('PROCESS_TIMEOUT');
    expect(binErr.code).toBe('BINARY_NOT_FOUND');
  });

  it('formats AppError with code and message', () => {
    const err = new AppError('CLI_INVALID_PATH', 'Invalid path');

    expect(formatErrorMessage(err)).toBe('CLI_INVALID_PATH: Invalid path');
  });

  it('formats standard Error messages', () => {
    expect(formatErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('formats non-Error values', () => {
    expect(formatErrorMessage('string error')).toBe('string error');
    expect(formatErrorMessage(123)).toBe('123');
  });

  it('identifies AppError and non-AppError values', () => {
    const app = new AppError('CLI_ABORTED', 'Aborted');
    expect(isAppError(app)).toBe(true);
    expect(isAppError(new Error('boom'))).toBe(false);
    expect(isAppError('nope')).toBe(false);
  });

  it('identifies ProcessError specifically', () => {
    const proc = new ProcessError('PROCESS_SPAWN_FAILED', 'Spawn failed');
    expect(isProcessError(proc)).toBe(true);
    const cli = new CliError('CLI_ABORTED', 'Aborted');
    expect(isProcessError(cli)).toBe(false);
  });

  it('checks for arbitrary error properties safely', () => {
    const obj = { code: 'SOME_CODE', info: { foo: 'bar' } };
    expect(hasErrorProperty(obj, 'code')).toBe(true);
    expect(hasErrorProperty(obj, 'baz')).toBe(false);
    expect(hasErrorProperty(null, 'code')).toBe(false);
    // Primitive values are not considered objects by hasErrorProperty
    expect(hasErrorProperty('string', 'length')).toBe(false);
  });
});
