/**
 * Tests for module barrel exports.
 */

import { describe, expect, it } from 'vitest';

import * as modules from './index.ts';

describe('modules index', () => {
  it('exports key module functions', () => {
    expect(typeof modules.checkBinaryExists).toBe('function');
    expect(typeof modules.runProcess).toBe('function');
    expect(typeof modules.buildResult).toBe('function');
    expect(typeof modules.determineStatus).toBe('function');
    expect(typeof modules.shouldSkipLinter).toBe('function');
  });
});
