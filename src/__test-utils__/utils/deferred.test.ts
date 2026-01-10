/**
 * Tests for deferred promise helper.
 */

import { describe, expect, it } from 'vitest';
import { _createDeferred, createDeferred } from './deferred.ts';

describe('createDeferred', () => {
  it('resolves when resolve is called', async () => {
    const d = createDeferred<number>();
    setTimeout(() => d.resolve(42), 0);
    const value = await d.promise;
    expect(value).toBe(42);
  });

  it('rejects when reject is called', async () => {
    const d = createDeferred<void>();
    const err = new Error('fail');
    setTimeout(() => d.reject(err), 0);
    await expect(d.promise).rejects.toBe(err);
  });

  it('alias _createDeferred behaves the same', async () => {
    const d = _createDeferred<string>();
    setTimeout(() => d.resolve('ok'), 0);
    await expect(d.promise).resolves.toBe('ok');
  });
});
