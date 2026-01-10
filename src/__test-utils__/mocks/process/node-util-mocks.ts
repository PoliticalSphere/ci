/**
 * Helpers for mocking node:util parseArgs behavior in tests.
 */

import { vi } from 'vitest';

/**
 * Create a parse-style error with code and optional option.
 *
 * @param message - Error message.
 * @param code - Error code to attach.
 * @param option - Optional flag name to attach.
 */
export const createParseError = (message: string, code: string, option?: string): Error => {
  const err = new Error(message);
  (err as { code?: string }).code = code;
  if (option !== undefined && option !== '') {
    (err as { code?: string; option?: string }).option = option;
  }
  return err;
};

/**
 * Create a parseArgs mock that throws the provided error.
 *
 * @param errorFactory - Factory for the error to throw.
 * @returns A parseArgs function that always throws.
 */
export const createParseArgsMock = (errorFactory: () => Error): (() => never) => {
  return () => {
    throw errorFactory();
  };
};

/**
 * Build a mocked node:util module with a custom parseArgs implementation.
 *
 * @param parseArgsFn - Function to use as parseArgs.
 * @returns A util-like module with parseArgs overridden.
 */
export const mockNodeUtil = async (
  parseArgsFn: () => never,
): Promise<typeof import('node:util') & { parseArgs: () => never }> => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    parseArgs: parseArgsFn,
  };
};

/**
 * Run a callback with node:util mocked to provide a custom parseArgs.
 *
 * @param parseArgsFn - Function to use as parseArgs.
 * @param cb - Callback executed with the mock in place.
 */
export const withMockedNodeUtil = async (
  parseArgsFn: () => never,
  cb: () => Promise<void> | void,
): Promise<void> => {
  vi.resetModules();
  vi.doMock('node:util', () => mockNodeUtil(parseArgsFn));
  try {
    await cb();
  } finally {
    vi.doUnmock('node:util');
    vi.resetModules();
  }
};
