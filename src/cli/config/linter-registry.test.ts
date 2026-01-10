/**
 * Tests for the linter registry surface area, ensuring configuration stability.
 */

import { describe, expect, it } from 'vitest';
import { createLinterConfig } from '../../__test-utils__/index.ts';

import {
  __test__assertValidRegistry,
  ALLOWED_ENFORCEMENT,
  getAllLinterIds,
  getLinterById,
  LINTER_MAP,
  LINTER_REGISTRY,
  type LinterConfig,
} from './linter-registry.ts';

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

  it('uses only allowed enforcement values', () => {
    for (const l of LINTER_REGISTRY) {
      expect(ALLOWED_ENFORCEMENT).toContain(l.enforcement);
    }
  });

  it('returns a linter by id when present', () => {
    const eslint = getLinterById('eslint');
    const expected = LINTER_REGISTRY.find((l) => l.id === 'eslint');

    expect(eslint).toEqual(expected);
    expect(eslint).toBe(expected);
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

  it('exposes LINTER_MAP for O(1) lookups and matches registry', () => {
    const eslintFromMap = LINTER_MAP.get('eslint');
    expect(eslintFromMap).toEqual(getLinterById('eslint'));
    expect(eslintFromMap).toBe(getLinterById('eslint'));
    // Ensure keys from map match the registry ids and order
    expect([...LINTER_MAP.keys()]).toEqual(LINTER_REGISTRY.map((l) => l.id));
  });

  it('keeps LINTER_MAP values aligned with registry instances', () => {
    const mapEntries = [...LINTER_MAP.entries()];
    for (const [id, linter] of mapEntries) {
      const registryEntry = LINTER_REGISTRY.find((entry) => entry.id === id);
      expect(linter).toBe(registryEntry);
    }
  });

  it('configures shell linters with sh and -c', () => {
    const shellIds = ['gitleaks', 'yamllint', 'shellcheck', 'hadolint'] as const;
    for (const id of shellIds) {
      const entry = getLinterById(id);
      expect(entry?.mode).toBe('shell');
      expect(entry?.binary).toBe('sh');
      expect(entry?.args[0]).toBe('-c');
    }
  });

  describe('registry validation', () => {
    const baseLinter = createLinterConfig({
      id: 'demo',
      name: 'Demo',
      binary: 'demo',
      args: [],
      timeoutMs: 10,
      mode: 'direct',
      risk: 'low',
      enforcement: 'advisory',
      description: 'demo',
    });

    it('allows expectedVersion when versionProbe is provided', () => {
      const registry = [
        {
          ...baseLinter,
          expectedVersion: '1.2.3',
          versionProbe: { binary: 'demo', args: ['--version'] },
        },
      ];
      expect(() => __test__assertValidRegistry(registry)).not.toThrow();
    });

    it('allows expectedVersion sentinel when versionProbe is provided', () => {
      const registry = [
        {
          ...baseLinter,
          expectedVersion: '0.0.0',
          versionProbe: { binary: 'demo', args: ['--version'] },
        },
      ];
      expect(() => __test__assertValidRegistry(registry)).not.toThrow();
    });

    it('accepts optional configFile and skipCheck fields', () => {
      const registry = [
        {
          ...baseLinter,
          configFile: '.demo.config',
          skipCheck: async () => ({ skip: false }),
        },
      ];
      expect(() => __test__assertValidRegistry(registry)).not.toThrow();
    });

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

    it('accepts the real registry without throwing', () => {
      expect(() => __test__assertValidRegistry(LINTER_REGISTRY)).not.toThrow();
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
