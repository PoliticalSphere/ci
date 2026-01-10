/**
 * Tests for node:util mocking helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  createParseArgsMock,
  createParseError,
  mockNodeUtil,
  withMockedNodeUtil,
} from './node-util-mocks';

// Test-only type describing parse errors created by helpers
type ParseErr = { code?: string; option?: string };

describe('node-util-mocks', () => {
  it('createParseError sets code and option', () => {
    const err = createParseError('bad parse', 'ERR_CODE', '--unknown');
    expect(err.message).toBe('bad parse');
    expect((err as ParseErr).code).toBe('ERR_CODE');
    expect((err as ParseErr).option).toBe('--unknown');
  });

  it('createParseError without option leaves option undefined', () => {
    const err = createParseError('simple', 'ERR');
    expect((err as ParseErr).option).toBeUndefined();
  });

  it('createParseArgsMock returns a function that throws the produced error', () => {
    const fn = createParseArgsMock(() => createParseError('boom', 'ERR_BOOM'));
    expect(() => fn()).toThrow('boom');
    try {
      fn();
    } catch (e) {
      expect((e as ParseErr).code).toBe('ERR_BOOM');
    }
  });

  it('mockNodeUtil returns util-like object with parseArgs override', async () => {
    const parseArgsFn = (): never => {
      throw new Error('PARSE_ERROR');
    };
    const utilLike = await mockNodeUtil(parseArgsFn);
    expect(utilLike.parseArgs).toBe(parseArgsFn);
    expect(() => utilLike.parseArgs()).toThrow('PARSE_ERROR');
    // Ensure other util properties are preserved
    expect(utilLike).toHaveProperty('format');
  });

  it('withMockedNodeUtil temporarily replaces node:util.parseArgs and restores after', async () => {
    const parseArgsFn = (): never => {
      throw new Error('TEMP_PARSE');
    };

    await withMockedNodeUtil(parseArgsFn, async () => {
      const { parseArgs } = await import('node:util');
      expect(parseArgs).toBe(parseArgsFn);
    });

    const { parseArgs: restoredParseArgs } = await import('node:util');
    expect(restoredParseArgs).not.toBe(parseArgsFn);
  });
});
