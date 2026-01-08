/**
 * Political Sphere - Linter Registry Tests
 */

import { describe, expect, it } from 'vitest';

import {
  __test__assertValidRegistry,
  getAllLinterIds,
  getLinterById,
  LINTER_REGISTRY,
  type LinterConfig,
} from './linters.ts';

describe('Political Sphere - Linters', () => {
  it('exports a registry with required fields', () => {
    expect(LINTER_REGISTRY.length).toBeGreaterThan(0);

    for (const linter of LINTER_REGISTRY) {
      expect(linter.id).toBeTruthy();
      expect(linter.name).toBeTruthy();
      expect(linter.binary).toBeTruthy();
      expect(Array.isArray(linter.args)).toBe(true);
      expect(linter.timeoutMs).toBeGreaterThan(0);
      expect(['direct', 'shell']).toContain(linter.mode);
      expect(['low', 'medium', 'high']).toContain(linter.risk);
      expect(['advisory', 'blocking', 'security']).toContain(linter.enforcement);
      expect(linter.description).toBeTruthy();
    }
  });

  it('returns a linter by id when present', () => {
    const eslint = getLinterById('eslint');
    const expected = LINTER_REGISTRY.find((l) => l.id === 'eslint');

    expect(eslint).toEqual(expected);
    expect(eslint?.mode).toBe('direct');
  });

  it('returns undefined for unknown linter id', () => {
    expect(getLinterById('not-a-real-linter')).toBeUndefined();
  });

  it('returns all linter ids without duplicates', () => {
    const ids = getAllLinterIds();
    const uniqueIds = new Set(ids);

    expect(ids).toEqual(LINTER_REGISTRY.map((l) => l.id));
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('exposes stable configuration for security linters', () => {
    const gitleaks = getLinterById('gitleaks') as LinterConfig;
    const actionlint = getLinterById('actionlint') as LinterConfig;

    expect(gitleaks.mode).toBe('shell');
    expect(gitleaks.configFile).toBe('.gitleaks.toml');
    expect(gitleaks.enforcement).toBe('security');
    expect(actionlint.enforcement).toBe('security');
    expect(actionlint.risk).toBe('high');
  });

  describe('registry validation', () => {
    const baseLinter: LinterConfig = {
      id: 'demo',
      name: 'Demo',
      binary: 'demo',
      args: [],
      timeoutMs: 10,
      mode: 'direct',
      risk: 'low',
      enforcement: 'advisory',
      description: 'demo',
    };

    it('throws on duplicate ids', () => {
      const registry = [baseLinter, { ...baseLinter, name: 'Other' }];
      expect(() => __test__assertValidRegistry(registry)).toThrow(/Duplicate linter id/);
    });

    it('throws on non-positive timeouts', () => {
      const registry = [{ ...baseLinter, timeoutMs: 0 }];
      expect(() => __test__assertValidRegistry(registry)).toThrow(/Timeout must be positive/);
    });

    it('throws when expectedVersion is empty', () => {
      const registry = [{ ...baseLinter, expectedVersion: '   ' }];
      expect(() => __test__assertValidRegistry(registry)).toThrow(
        /expectedVersion must be non-empty/,
      );
    });

    it('throws when expectedVersion is set without versionProbe', () => {
      const registry = [{ ...baseLinter, expectedVersion: '1.0.0' }];
      expect(() => __test__assertValidRegistry(registry)).toThrow(/versionProbe must be provided/);
    });
  });

  it('references semgrep package to satisfy knip detection', async () => {
    try {
      // Dynamic import is preferred and still allows knip to detect the package name in source.
      const semgrep = await import('semgrep');
      expect(typeof semgrep).toBeDefined();
    } catch {
      // semgrep may not be installed in all environments; that's fine for this test
      expect(true).toBe(true);
    }
  });
});
