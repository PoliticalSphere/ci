import { describe, expect, it } from 'vitest';
import type { CLIArgs } from '../../cli/input/args.ts';
import { expectDefaultArgs, expectParsedFlags } from './args-helpers.ts';

describe('args helpers', () => {
  it('expectDefaultArgs validates default flag values', () => {
    const args: CLIArgs = {
      verifyLogs: false,
      logDir: './logs',
      help: false,
      verbose: false,
      linters: undefined,
      incremental: false,
      clearCache: false,
      version: false,
      structuredLogs: false,
      circuitBreaker: false,
    };

    expectDefaultArgs(args);
    expect(args).toBeDefined();
  });

  it('expectParsedFlags matches provided flags and ignores missing ones', () => {
    const args: CLIArgs = {
      verifyLogs: true,
      logDir: './custom-logs',
      help: false,
      verbose: true,
      linters: ['eslint'],
      incremental: false,
      clearCache: false,
      version: false,
      structuredLogs: false,
      circuitBreaker: false,
    };

    expectParsedFlags(args, {
      verifyLogs: true,
      logDir: './custom-logs',
      linters: ['eslint'],
      verbose: true,
    });

    expect(() => expectParsedFlags(args, {})).not.toThrow();
  });
});
