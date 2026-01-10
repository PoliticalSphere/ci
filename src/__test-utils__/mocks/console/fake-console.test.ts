/**
 * Tests for fake console mock.
 */

import { describe, expect, it } from 'vitest';
import { fakeConsole } from './fake-console';

describe('fakeConsole', () => {
  it('returns spies for all console methods', () => {
    const c = fakeConsole();

    expect(typeof c.log).toBe('function');
    expect(typeof c.error).toBe('function');
    expect(typeof c.warn).toBe('function');
    expect(typeof c.info).toBe('function');
  });

  it('spy functions record calls and arguments', () => {
    const c = fakeConsole();

    c.log('a', 1);
    c.error('err');
    c.warn('warn', 'me');
    c.info();

    expect(c.log).toHaveBeenCalledTimes(1);
    expect(c.log).toHaveBeenCalledWith('a', 1);

    expect(c.error).toHaveBeenCalledTimes(1);
    expect(c.error).toHaveBeenCalledWith('err');

    expect(c.warn).toHaveBeenCalledTimes(1);
    expect(c.warn).toHaveBeenCalledWith('warn', 'me');

    expect(c.info).toHaveBeenCalledTimes(1);
    expect(c.info).toHaveBeenCalledWith();
  });

  it('creates fresh spies on each call', () => {
    const c1 = fakeConsole();
    const c2 = fakeConsole();

    c1.log('first');
    c2.log('second');

    expect(c1.log).toHaveBeenCalledTimes(1);
    expect(c1.log).toHaveBeenCalledWith('first');

    expect(c2.log).toHaveBeenCalledTimes(1);
    expect(c2.log).toHaveBeenCalledWith('second');

    // spies are not the same function reference
    expect(c1.log).not.toBe(c2.log);
  });
});
