/**
 * Tests for input validation helpers
 *
 * This suite verifies `resolveLinters` and `ensureSafeDirectoryPath`
 * behaviors. Many tests use `vi.resetModules()` to load the real
 * implementation or inject lightweight mocks for registry lookups.
 */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  biomeLinter,
  eslintLinter,
} from '../../__test-utils__/fixtures/validation/validation-fixtures';
import { withEnv } from '../../__test-utils__/index.ts';

// We'll import the module under test after mocking where necessary using `vi.resetModules`.

describe('validation module (unit)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('resolveLinters (mocked registry interactions)', () => {
    it('always appends ESLint warning-as-error args when no input is provided', async () => {
      await withEnv({ CI: undefined }, async () => {
        const eslint = eslintLinter;
        const biome = biomeLinter;

        const { resolveLinters } = await import('./validation.ts');
        const result = resolveLinters(undefined, { getRegistry: () => [eslint, biome] });

        const eslintResult = result.find((l) => l.id === 'eslint');
        expect(eslintResult?.args).toEqual([...eslint.args, '--max-warnings', '0']);
        const biomeResult = result.find((l) => l.id === 'biome');
        expect(biomeResult?.args).toEqual(biome.args);
      });
    });
    it('appends ESLint warning-as-error args when CI is set and no input is provided', async () => {
      await withEnv({ CI: 'true' }, async () => {
        const eslint = eslintLinter;
        const biome = biomeLinter;

        const { resolveLinters } = await import('./validation.ts');

        const result = resolveLinters(undefined, {
          getRegistry: () => [eslint, biome],
        });

        const eslintResult = result.find((l) => l.id === 'eslint');
        expect(eslintResult?.args).toEqual([...eslint.args, '--max-warnings', '0']);
        const biomeResult = result.find((l) => l.id === 'biome');
        expect(biomeResult?.args).toEqual(biome.args);
      });
    });

    it('appends ESLint warning-as-error args when input is provided (regardless of CI)', async () => {
      await withEnv({ CI: undefined }, async () => {
        const eslint = eslintLinter;
        const biome = biomeLinter;

        const { resolveLinters } = await import('./validation.ts');

        const result = resolveLinters(['eslint,biome'], {
          getAllIds: () => ['eslint', 'biome'],
          getById: (id: string) => (id === 'eslint' ? eslint : biome),
        });

        const eslintResult = result.find((l) => l.id === 'eslint');
        expect(eslintResult?.args).toEqual([...eslint.args, '--max-warnings', '0']);
        const biomeResult = result.find((l) => l.id === 'biome');
        expect(biomeResult?.args).toEqual(biome.args);
      });
    });

    it('filters out liners that are not present in registry (getLinterById returns undefined)', async () => {
      const fakeRegistry = [
        {
          id: 'a',
          name: 'A',
          binary: 'a-bin',
          args: [],
          timeoutMs: 1,
          mode: 'direct',
          risk: 'low',
          enforcement: 'advisory',
          description: 'A',
        },
      ] as const;

      const { resolveLinters } = await import('./validation.ts');

      // Act
      const result = resolveLinters(['a', 'b'], {
        getAllIds: () => ['a', 'b'],
        getById: (id: string) => (id === 'a' ? fakeRegistry[0] : undefined),
        getRegistry: () => fakeRegistry,
      });

      // Assert: only 'a' should be returned and no error thrown for missing 'b'
      expect(result.map((r) => r.id)).toEqual(['a']);
    });

    it('throws on empty linter id (comma with empty entry)', async () => {
      // Use the real config (no mocking needed) to validate parsing/empty check
      const { resolveLinters } = await import('./validation.ts');
      expect(() => resolveLinters(['eslint,,typescript'])).toThrow(/Empty linter IDs/);
    });

    it('throws on invalid linter id format', async () => {
      const { resolveLinters } = await import('./validation.ts');
      expect(() => resolveLinters(['eslint,$bad'])).toThrow(/Invalid linter IDs:/);
    });

    it('includes valid id list in invalid linter error message', async () => {
      const { resolveLinters } = await import('./validation.ts');
      try {
        resolveLinters(['eslint,$bad']);
      } catch (err) {
        expect(String(err)).toContain('Valid linters:');
      }
    });

    it('throws when too many linter IDs are provided', async () => {
      const { resolveLinters } = await import('./validation.ts');
      const ids = Array.from({ length: 101 }, (_, i) => `lint-${i}`);
      expect(() => resolveLinters(ids)).toThrow(/Invalid linter IDs:/);
    });

    it('throws when linter ID exceeds max length', async () => {
      const { resolveLinters } = await import('./validation.ts');
      const longId = `a${'b'.repeat(64)}`;
      expect(() => resolveLinters([longId])).toThrow(/Invalid linter IDs:/);
    });
  });

  describe('ensureSafeDirectoryPath', () => {
    let ensureSafeDirectoryPath: (base: string, dir: string) => string;

    beforeAll(async () => {
      ({ ensureSafeDirectoryPath } = await import('./validation.ts'));
    });

    it('accepts absolute path that is inside base dir', () => {
      const base = '/home/user/project';
      const absoluteInside = path.join(base, 'logs');
      const resolved = ensureSafeDirectoryPath(base, absoluteInside);
      expect(resolved).toBe(absoluteInside);
    });

    it('rejects traversal to parent using ".."', () => {
      const base = '/home/user/project';
      expect(() => ensureSafeDirectoryPath(base, '..')).toThrow(/Log directory must be within/);
    });

    it('resolves relative path within base', () => {
      const base = '/home/user/project';
      const resolved = ensureSafeDirectoryPath(base, './logs');
      expect(resolved).toBe(path.resolve(base, 'logs'));
    });

    it('rejects when path shares prefix but is outside', () => {
      const base = '/home/user/project';
      expect(() => ensureSafeDirectoryPath(base, '/home/user/project2/logs')).toThrow(
        /Log directory must be within/,
      );
    });

    it('handles paths containing null bytes (platform dependent)', () => {
      const base = '/home/user/project';
      // Implementation currently does not explicitly reject null bytes; ensure it returns a string
      expect(() => ensureSafeDirectoryPath(base, 'logs\0bad')).not.toThrow();
    });

    it('accepts unicode paths within base', () => {
      const base = '/home/user/project';
      const resolved = ensureSafeDirectoryPath(base, './logs/ユニコード');
      expect(resolved).toBe(path.resolve(base, 'logs/ユニコード'));
    });

    it('accepts long path inputs (platform dependent)', () => {
      const base = '/home/user/project';
      const longPath = `logs/${'a'.repeat(2000)}`;
      expect(() => ensureSafeDirectoryPath(base, longPath)).not.toThrow();
    });

    it('accepts resolved path that may be long (platform dependent)', () => {
      const base = `/${'a'.repeat(1030)}`;
      expect(() => ensureSafeDirectoryPath(base, 'b')).not.toThrow();
    });

    it('rejects Windows-style traversal paths', () => {
      const base = '/home/user/project';
      expect(() => ensureSafeDirectoryPath(base, String.raw`logs\\..\\..\\etc`)).toThrow(
        /Log directory must be within/,
      );
    });

    it('rejects backslash paths on non-Windows platforms', () => {
      if (path.sep === '\\') {
        return;
      }
      const base = '/home/user/project';
      expect(() => ensureSafeDirectoryPath(base, String.raw`logs\nested`)).toThrow(
        /Log directory must be within/,
      );
    });

    it('rejects symlink traversal outside base', () => {
      const base = fs.mkdtempSync(path.join(tmpdir(), 'ps-base-'));
      const outside = fs.mkdtempSync(path.join(tmpdir(), 'ps-outside-'));
      const link = path.join(base, 'logs');
      try {
        fs.symlinkSync(outside, link);
      } catch (error) {
        // Some environments (e.g., Windows without privileges) can't create symlinks.
        expect(error).toBeTruthy();
        return;
      }
      expect(() => ensureSafeDirectoryPath(base, 'logs')).toThrow(/Log directory must be within/);
    });

    it('rejects when realpath resolves outside base', () => {
      const base = '/home/user/project';
      const realpathSpy = vi.spyOn(fs, 'realpathSync').mockReturnValue('/etc');

      expect(() => ensureSafeDirectoryPath(base, 'logs')).toThrow(/Log directory must be within/);

      realpathSpy.mockRestore();
    });

    it('rejects when mocked realpath resolves outside base', async () => {
      const base = '/home/user/project';

      vi.resetModules();
      vi.doMock('node:fs', () => ({
        default: {
          realpathSync: () => '/etc',
        },
      }));

      const { ensureSafeDirectoryPath: mockedEnsure } = await import('./validation.ts');

      expect(() => mockedEnsure(base, 'logs')).toThrow(/Log directory must be within/);

      vi.doUnmock('node:fs');
      vi.resetModules();
    });
  });
});
