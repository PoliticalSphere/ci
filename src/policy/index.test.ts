import { describe, expect, it } from 'vitest';
import { VIOLATION_CI_CHECK_FAILURE } from './index.js';

describe('policy public API', () => {
  it('exports VIOLATION_CI_CHECK_FAILURE', () => {
    expect(VIOLATION_CI_CHECK_FAILURE).toBeDefined();
  });
});
