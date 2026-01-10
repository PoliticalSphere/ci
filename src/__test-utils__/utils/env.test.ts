/**
 * Tests for environment helpers.
 */

import { describe, expect, it } from 'vitest';

import { restoreEnv, snapshotEnv, withEnv } from './env.ts';

describe('env helpers', () => {
  it('snapshotEnv captures values and restoreEnv restores them', () => {
    const key = 'PS_ENV_HELPER_TEST';
    const original = process.env[key];

    process.env[key] = 'before';
    const snapshot = snapshotEnv([key]);
    process.env[key] = 'after';

    restoreEnv(snapshot);
    expect(process.env[key]).toBe('before');

    if (original === undefined) {
      process.env[key] = undefined;
    } else {
      process.env[key] = original;
    }
  });

  it('withEnv applies updates and restores originals', async () => {
    const key = 'PS_ENV_HELPER_TEMP';
    const original = process.env[key];

    await withEnv({ [key]: 'temp' }, async () => {
      expect(process.env[key]).toBe('temp');
    });

    if (original === undefined) {
      expect(process.env[key]).toBeUndefined();
      process.env[key] = undefined;
    } else {
      expect(process.env[key]).toBe(original);
      process.env[key] = original;
    }
  });

  it('withEnv can unset variables', async () => {
    const key = 'PS_ENV_HELPER_UNSET';
    process.env[key] = 'set';

    await withEnv({ [key]: undefined }, async () => {
      expect(process.env[key]).toBeUndefined();
    });

    expect(process.env[key]).toBe('set');
    process.env[key] = undefined;
  });
});
