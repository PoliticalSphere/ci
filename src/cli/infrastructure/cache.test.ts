/**
 * Tests covering the infrastructure caching helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disableCaching, ExecutionCache, enableCaching } from './cache.ts';

// Force computeGitStateHash to use Date-based fallback by making statSync throw
vi.mock('node:fs', () => ({
  statSync: () => {
    throw new Error('no git index');
  },
}));

describe('ExecutionCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('caches and expires binary checks', async () => {
    const cache = new ExecutionCache({ binaryTtlMs: 50 });

    expect(cache.getBinaryCheck('bin')).toBeNull();
    cache.setBinaryCheck('bin', true);
    expect(cache.getBinaryCheck('bin')).toBe(true);

    await vi.advanceTimersByTimeAsync(60);
    expect(cache.getBinaryCheck('bin')).toBeNull();
  });

  it('caches and expires version checks', async () => {
    const cache = new ExecutionCache({ versionTtlMs: 50 });

    expect(cache.getVersionCheck('l1')).toBeNull();
    cache.setVersionCheck('l1', { version: '1.2.3' });
    expect(cache.getVersionCheck('l1')).toEqual({ version: '1.2.3' });

    await vi.advanceTimersByTimeAsync(60);
    expect(cache.getVersionCheck('l1')).toBeNull();
  });

  it('returns skip decision when git state unchanged and invalidates when changed', async () => {
    const cache = new ExecutionCache({ skipDecisionTtlMs: 60_000 });

    expect(cache.getSkipDecision('l2')).toBeNull();

    // Mock hash to a stable value for set, then change before get
    let current = 'hash-1';
    const spy = vi
      .spyOn(
        ExecutionCache.prototype as unknown as { computeGitStateHash: () => string },
        'computeGitStateHash',
      )
      .mockImplementation(() => current);

    cache.setSkipDecision('l2', { skip: true, reason: 'cached' });
    expect(cache.getSkipDecision('l2')).toEqual({ skip: true, reason: 'cached' });

    // Change hash without touching time to avoid TTL expiry
    current = 'hash-2';
    expect(cache.getSkipDecision('l2')).toBeNull();

    spy.mockRestore();
  });

  it('expires skip decisions by TTL', async () => {
    const cache = new ExecutionCache({ skipDecisionTtlMs: 50 });

    cache.setSkipDecision('l3', { skip: false });
    expect(cache.getSkipDecision('l3')).toEqual({ skip: false });

    await vi.advanceTimersByTimeAsync(60);
    expect(cache.getSkipDecision('l3')).toBeNull();
  });

  it('clears caches individually and reports stats', () => {
    const cache = new ExecutionCache();

    cache.setBinaryCheck('b', true);
    cache.setVersionCheck('v', { version: '0.1.0' });
    cache.setSkipDecision('s', { skip: true });

    const stats1 = cache.getStats();
    expect(stats1.binaries).toBe(1);
    expect(stats1.versions).toBe(1);
    expect(stats1.skipDecisions).toBe(1);
    expect(stats1.totalEntries).toBe(3);

    cache.clearBinaries();
    const stats2 = cache.getStats();
    expect(stats2.binaries).toBe(0);
    expect(stats2.versions).toBe(1);
    expect(stats2.skipDecisions).toBe(1);

    cache.clearVersions();
    const stats3 = cache.getStats();
    expect(stats3.versions).toBe(0);

    cache.clearSkipDecisions();
    const stats4 = cache.getStats();
    expect(stats4.skipDecisions).toBe(0);
    expect(stats4.totalEntries).toBe(0);
  });

  it('supports enable and disable of global caching', () => {
    const instance = enableCaching({ binaryTtlMs: 10 });
    expect(instance).toBeInstanceOf(ExecutionCache);
    disableCaching();
  });

  it('invalidates skip decision when entry hash is missing', () => {
    const cache = new ExecutionCache({ skipDecisionTtlMs: 60_000 });

    // Insert malformed entry lacking hash to hit entryHash == null path
    (cache as unknown as { skipDecisions: Map<string, unknown> }).skipDecisions.set('l4', {
      linterId: 'l4',
      value: { skip: true },
      timestamp: Date.now(),
      // hash: undefined
    });

    expect(cache.getSkipDecision('l4')).toBeNull();
  });

  it('invalidates skip decision when current hash is empty', () => {
    const cache = new ExecutionCache({ skipDecisionTtlMs: 60_000 });

    // Set with a valid hash first
    vi.spyOn(
      ExecutionCache.prototype as unknown as { computeGitStateHash: () => string },
      'computeGitStateHash',
    ).mockReturnValue('hash-ok');
    cache.setSkipDecision('l5', { skip: false });

    // Now force get to see an empty current hash
    const spy2 = vi
      .spyOn(
        ExecutionCache.prototype as unknown as { computeGitStateHash: () => string },
        'computeGitStateHash',
      )
      .mockReturnValue('');

    expect(cache.getSkipDecision('l5')).toBeNull();
    spy2.mockRestore();
  });

  it('clear() removes all caches at once', () => {
    const cache = new ExecutionCache();
    cache.setBinaryCheck('b', true);
    cache.setVersionCheck('v', { version: '1.0.0' });
    cache.setSkipDecision('s', { skip: true });

    cache.clear();

    const stats = cache.getStats();
    expect(stats.binaries).toBe(0);
    expect(stats.versions).toBe(0);
    expect(stats.skipDecisions).toBe(0);
    expect(stats.totalEntries).toBe(0);
  });
});
