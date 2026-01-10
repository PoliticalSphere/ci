import { describe, expect, it } from 'vitest';

import { MINUTE_MS, MS_PER_SECOND } from './time.ts';

describe('CLI time constants', () => {
  it('defines milliseconds per second as 1000', () => {
    expect(MS_PER_SECOND).toBe(1000);
  });

  it('defines minute duration as 60*MS_PER_SECOND', () => {
    expect(MINUTE_MS).toBe(60 * MS_PER_SECOND);
  });
});
