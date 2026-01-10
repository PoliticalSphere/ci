import { describe, expect, it } from 'vitest';

import { PKG_FILENAME, PKG_VERSION_FALLBACK } from './paths.ts';

describe('CLI path constants', () => {
  it('exports a package filename constant', () => {
    expect(PKG_FILENAME).toBe('package.json');
  });

  it('exports a fallback version sentinel', () => {
    expect(PKG_VERSION_FALLBACK).toBe('unknown');
  });
});
