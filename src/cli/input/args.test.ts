/**
 * Tests for CLI argument parsing helpers.
 */

import { describe, expect, it, vi } from 'vitest';
import { expectDefaultArgs, expectParsedFlags } from '../../__test-utils__/assertions/args-helpers';
import { parseCliArgs } from './args.ts';

describe('input/args.ts', () => {
  it('parses defaults when no argv provided', () => {
    const args = parseCliArgs([]);

    expectDefaultArgs(args);
    expect(args).toBeDefined();
  });

  it('parses flags and linters from argv and trims values', () => {
    const args = parseCliArgs([
      '--verify-logs',
      '--log-dir',
      './build/logs',
      '--linters',
      'eslint, typescript',
      '--verbose',
    ]);

    expectParsedFlags(args, {
      verifyLogs: true,
      logDir: './build/logs',
      linters: ['eslint', 'typescript'],
      verbose: true,
    });
    expect(args).toBeDefined();
  });

  it('maps --debug to verbose', () => {
    const args = parseCliArgs(['--debug']);
    expect(args.verbose).toBe(true);
  });

  it('parses structured log and circuit breaker flags', () => {
    const args = parseCliArgs(['--structured-logs', '--circuit-breaker']);
    expect(args.structuredLogs).toBe(true);
    expect(args.circuitBreaker).toBe(true);
  });

  it('throws when --log-dir is empty or whitespace only', () => {
    expect(() => parseCliArgs(['--log-dir', '   '])).toThrow(/--log-dir requires a path/);
  });

  it('throws when --linters is missing a value', () => {
    expect(() => parseCliArgs(['--linters'])).toThrow(/--linters requires at least one linter id/);
  });

  it('throws on unexpected positional arguments', () => {
    expect(() => parseCliArgs(['eslint'])).toThrow(/Unexpected argument: eslint/);
  });

  it('handles non-Error thrown values from parseArgs', async () => {
    vi.resetModules();

    vi.doMock('node:util', () => ({
      parseArgs: () => {
        // Throwing a string instead of an Error instance to simulate library bugs
        throw 'not-an-error';
      },
    }));

    try {
      const { parseCliArgs: parseWithMock } = await import('./args.ts');
      try {
        parseWithMock(['--log-dir']);
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as { code?: string }).code).toBe('CLI_PARSE_ERROR');
        expect((err as Error).message).toContain('not-an-error');
      }
    } finally {
      vi.doUnmock('node:util');
      vi.resetModules();
    }
  });
});
