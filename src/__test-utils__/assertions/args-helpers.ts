import { expect } from 'vitest';
import type { CLIArgs } from '../../cli/input/args.ts';

export function expectDefaultArgs(args: CLIArgs): void {
  expect(args.verifyLogs).toBe(false);
  expect(args.logDir).toBe('./logs');
  expect(args.help).toBe(false);
  expect(args.verbose).toBe(false);
  expect(args.linters).toBeUndefined();
}

export function expectParsedFlags(args: CLIArgs, expected: Partial<CLIArgs>): void {
  if (expected.verifyLogs !== undefined) {
    expect(args.verifyLogs).toBe(expected.verifyLogs);
  }
  if (expected.logDir !== undefined) {
    expect(args.logDir).toBe(expected.logDir);
  }
  if (expected.linters !== undefined) {
    expect(args.linters).toEqual(expected.linters);
  }
  if (expected.verbose !== undefined) {
    expect(args.verbose).toBe(expected.verbose);
  }
}
