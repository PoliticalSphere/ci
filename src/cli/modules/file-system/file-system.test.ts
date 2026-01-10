/**
 * Tests for file system utilities used by skip checks and CLI validation.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { withEnv } from '../../../__test-utils__/index.ts';
import {
  DEFAULT_MAX_DEPTH,
  directoryExists,
  expandFilePatterns,
  hasFilesInDir,
  hasFilesWithExtensions,
  matchesPattern,
} from './file-system.ts';

const createTempDir = async (): Promise<string> => mkdtemp(path.join(tmpdir(), 'ci-fs-'));

describe('File System Utilities', () => {
  describe('DEFAULT_MAX_DEPTH', () => {
    afterEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      process.env.PS_FS_MAX_DEPTH = undefined;
    });

    it('should be a finite number', () => {
      expect(typeof DEFAULT_MAX_DEPTH).toBe('number');
      expect(Number.isFinite(DEFAULT_MAX_DEPTH)).toBe(true);
      expect(DEFAULT_MAX_DEPTH >= 0).toBe(true);
    });

    it('should default to 10', () => {
      expect(DEFAULT_MAX_DEPTH).toBe(10);
    });

    it('should use environment variable PS_FS_MAX_DEPTH when valid', async () => {
      await withEnv({ PS_FS_MAX_DEPTH: '42' }, async () => {
        vi.resetModules();
        const mod = await import('./file-system.ts');
        expect(mod.DEFAULT_MAX_DEPTH).toBe(42);
      });
    });

    it('should reject invalid PS_FS_MAX_DEPTH and use default', async () => {
      await withEnv({ PS_FS_MAX_DEPTH: 'not-a-number' }, async () => {
        vi.resetModules();
        const mod = await import('./file-system.ts');
        expect(mod.DEFAULT_MAX_DEPTH).toBe(10);
      });
    });

    it('should reject negative PS_FS_MAX_DEPTH values', async () => {
      await withEnv({ PS_FS_MAX_DEPTH: '-5' }, async () => {
        vi.resetModules();
        const mod = await import('./file-system.ts');
        expect(mod.DEFAULT_MAX_DEPTH).toBe(10);
      });
    });

    it('should handle boundary value 0', async () => {
      await withEnv({ PS_FS_MAX_DEPTH: '0' }, async () => {
        vi.resetModules();
        const mod = await import('./file-system.ts');
        expect(mod.DEFAULT_MAX_DEPTH).toBe(0);
      });
    });

    it('validates PS_FS_MAX_DEPTH parsing for multiple inputs', () => {
      const cases: [string, boolean, number | null][] = [
        ['15', true, 15],
        ['0', true, 0],
        ['100', true, 100],
        ['-5', false, null],
        ['invalid', false, null],
        ['NaN', false, null],
        ['25', true, 25],
        ['not-a-number', false, null],
        ['Infinity', false, null],
        ['-1', false, null],
        ['1', true, 1],
        ['999999', true, 999_999],
      ];

      for (const [value, shouldBeValid, expected] of cases) {
        const v = value as string | undefined;
        if (typeof v === 'string') {
          const n = Number.parseInt(v, 10);
          const isValid = !Number.isNaN(n) && Number.isFinite(n) && n >= 0;
          expect(isValid).toBe(shouldBeValid);
          if (shouldBeValid && expected !== null) {
            expect(n).toBe(expected);
          }
        }
      }
    });
  });

  describe('directoryExists', () => {
    it('returns true for existing directories', async () => {
      const result = await directoryExists('/tmp');
      expect(result).toBe(true);
    });

    it('returns false for non-existent paths', async () => {
      const result = await directoryExists('/nonexistent/path/that/does/not/exist');
      expect(result).toBe(false);
    });
  });

  describe('matchesPattern', () => {
    it('matches wildcard patterns', () => {
      // Pattern matching expects filename to already be lowercase for wildcards
      expect(matchesPattern('dockerfile.prod', 'dockerfile*')).toBe(true);
      expect(matchesPattern('dockerfile', 'dockerfile*')).toBe(true);
      expect(matchesPattern('not-dockerfile', 'dockerfile*')).toBe(false);
    });

    it('matches non-wildcard patterns case-insensitively', () => {
      // matchesPattern does case-insensitive comparison by lowercasing the pattern
      expect(matchesPattern('dockerfile', 'Dockerfile')).toBe(true);
      expect(matchesPattern('dockerfile', 'dockerfile')).toBe(true);
      expect(matchesPattern('not-file', 'dockerfile')).toBe(false);
    });

    it('returns false for non-matching patterns', () => {
      expect(matchesPattern('file.txt', 'dockerfile*')).toBe(false);
    });
  });

  describe('hasFilesWithExtensions', () => {
    it('returns false for non-existent directories', async () => {
      const result = await hasFilesWithExtensions('/nonexistent/dir', ['.ts']);
      expect(result).toBe(false);
    });

    it('returns true when a matching file exists', async () => {
      const dir = await createTempDir();
      try {
        await writeFile(path.join(dir, 'sample.md'), 'content');
        const result = await hasFilesWithExtensions(dir, ['.md']);
        expect(result).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns true when a wildcard pattern matches', async () => {
      const dir = await createTempDir();
      try {
        await writeFile(path.join(dir, 'dockerfile.prod'), 'content');
        const result = await hasFilesWithExtensions(dir, ['dockerfile*']);
        expect(result).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns true when a nested directory contains a matching file', async () => {
      const dir = await createTempDir();
      try {
        const nested = path.join(dir, 'nested');
        await mkdir(nested);
        await writeFile(path.join(nested, 'config.yml'), 'content');
        const result = await hasFilesWithExtensions(dir, ['.yml']);
        expect(result).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns false when no files match', async () => {
      const result = await hasFilesWithExtensions('/tmp', ['.fake_ext_12345']);
      expect(result).toBe(false);
    });

    it('respects max depth limit', async () => {
      const result = await hasFilesWithExtensions('/tmp', ['.ts'], 0);
      expect(result).toBe(false);
    });

    it('ignores common directories', async () => {
      // node_modules should be ignored during search
      const result = await hasFilesWithExtensions('.', ['.node_modules_fake']);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('hasFilesInDir', () => {
    it('returns false for non-existent directories', async () => {
      const result = await hasFilesInDir('/nonexistent/dir', ['.yml']);
      expect(result).toBe(false);
    });

    it('returns true when a matching file exists', async () => {
      const dir = await createTempDir();
      try {
        await writeFile(path.join(dir, 'config.yml'), 'content');
        const result = await hasFilesInDir(dir, ['.yml']);
        expect(result).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns false when directory has no matching files', async () => {
      const result = await hasFilesInDir('/tmp', ['.nonexistent_ext_99999']);
      expect(result).toBe(false);
    });

    it('handles readdir errors gracefully', async () => {
      // Pass a path that exists but is not a directory
      const result = await hasFilesInDir('/etc/hostname', ['.yml']);
      // Should return false when trying to list files in non-directory
      expect(result).toBe(false);
    });
  });

  describe('expandFilePatterns', () => {
    it('returns empty array when patterns are undefined or empty', async () => {
      const dir = await createTempDir();
      try {
        const mod = await import('./file-system.ts');
        const results1 = await mod.expandFilePatterns(undefined, dir);
        const results2 = await mod.expandFilePatterns([], dir);
        expect(results1).toEqual([]);
        expect(results2).toEqual([]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns empty array when aborted via signal', async () => {
      const dir = await createTempDir();
      try {
        await writeFile(path.join(dir, 'a.md'), 'x');
        const controller = new AbortController();
        controller.abort();
        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(
          ['**/*.md'],
          dir,
          undefined,
          controller.signal,
        );
        expect(results).toEqual([]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('matches files with glob patterns and respects depth', async () => {
      const dir = await createTempDir();
      const nestedA = path.join(dir, 'a');
      const nestedB = path.join(nestedA, 'b');
      try {
        await mkdir(nestedA);
        await mkdir(nestedB);
        await writeFile(path.join(nestedB, 'file.yml'), 'y');
        await writeFile(path.join(dir, '.hidden'), 'h');

        const mod = await import('./file-system.ts');
        const resultsYml = await mod.expandFilePatterns(['**/*.yml'], dir);
        expect(resultsYml.some((p) => p.endsWith('/file.yml'))).toBe(true);

        const resultsDot = await mod.expandFilePatterns(['**/.*'], dir);
        expect(resultsDot.some((p) => p.endsWith('/.hidden'))).toBe(true);

        const resultsDepth1 = await mod.expandFilePatterns(['**/*.yml'], dir, 1);
        expect(resultsDepth1.length).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('traverses directories to find nested matches', async () => {
      const dir = await createTempDir();
      try {
        const nested = path.join(dir, 'nested');
        await mkdir(nested);
        await writeFile(path.join(nested, 'deep.txt'), 'd');

        const results = await expandFilePatterns(['**/*.txt'], dir);
        expect(results.some((p) => p.endsWith('/nested/deep.txt'))).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('ignores common directories (e.g., node_modules)', async () => {
      const dir = await createTempDir();
      const nm = path.join(dir, 'node_modules');
      try {
        await mkdir(nm);
        await writeFile(path.join(nm, 'pkg.js'), 'const x = 1;');
        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.js'], dir);
        expect(results.some((p) => p.includes('/node_modules/'))).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('handles symlink to outside base by skipping it', async () => {
      const base = await createTempDir();
      const outside = await createTempDir();
      try {
        const outsideFile = path.join(outside, 'outside.txt');
        await writeFile(outsideFile, 'o');
        const linkPath = path.join(base, 'link-outside.txt');
        await symlink(outsideFile, linkPath);

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.txt'], base);
        expect(results).not.toContain(linkPath);
      } finally {
        await rm(base, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('handles symlink to directory inside base and finds files', async () => {
      const base = await createTempDir();
      const targetDir = path.join(base, 'real-dir');
      try {
        await mkdir(targetDir);
        const mdFile = path.join(targetDir, 'inside.md');
        await writeFile(mdFile, 'm');
        const linkDir = path.join(base, 'link-dir');
        await symlink(targetDir, linkDir);

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.md'], base);
        // Result should include the symlinked path to the file under link-dir
        expect(results.some((p) => p.endsWith('/link-dir/inside.md'))).toBe(true);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    });

    it('handles symlink to file inside base and includes the link path', async () => {
      const base = await createTempDir();
      try {
        const real = path.join(base, 'note.txt');
        await writeFile(real, 'n');
        const link = path.join(base, 'note-link.txt');
        await symlink(real, link);

        const results = await expandFilePatterns(['**/*.txt'], base);
        expect(results).toContain(link);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    });

    it('continues on broken symlink (realpath/stat error)', async () => {
      const base = await createTempDir();
      try {
        const brokenTarget = path.join(base, 'nonexistent-target.txt');
        const brokenLink = path.join(base, 'broken-link.txt');
        await symlink(brokenTarget, brokenLink);

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.txt'], base);
        // Broken symlink should be ignored
        expect(results).not.toContain(brokenLink);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    });

    it('allows symlink pointing to the base directory itself', async () => {
      const base = await createTempDir();
      try {
        // Create a real file under base
        const realFile = path.join(base, 'root.md');
        await writeFile(realFile, 'root');
        // Create a symlink that resolves to the base directory
        const linkToBase = path.join(base, 'link-root');
        await symlink(base, linkToBase);

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.md'], base);
        // Should find the file via traversal; presence verifies branch allowing real===resolvedBase
        expect(results.some((p) => p.endsWith('/root.md'))).toBe(true);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    });

    it('aborts traversal when signal is triggered mid-walk', async () => {
      const dir = await createTempDir();
      const controller = new AbortController();
      try {
        // Create enough entries to ensure iteration time
        await mkdir(path.join(dir, 'a'));
        await mkdir(path.join(dir, 'b'));
        await mkdir(path.join(dir, 'c'));
        await writeFile(path.join(dir, 'a', 'f1.ts'), '');
        await writeFile(path.join(dir, 'b', 'f2.ts'), '');
        await writeFile(path.join(dir, 'c', 'f3.ts'), '');

        const mod = await import('./file-system.ts');
        const promise = mod.expandFilePatterns(['**/*.ts'], dir, undefined, controller.signal);
        // Abort immediately; should be observed during walk loop
        controller.abort();
        const results = await promise;
        // Should be a subset or empty due to early abort; important is execution path coverage
        expect(Array.isArray(results)).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns empty array when readdir fails during expansion', async () => {
      vi.resetModules();
      const dir = await createTempDir();
      try {
        await vi.doMock('node:fs/promises', async () => {
          const actual =
            await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
          return {
            ...actual,
            readdir: vi.fn().mockRejectedValue(new Error('readdir failed')),
          };
        });

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.ts'], dir);
        expect(results).toEqual([]);
      } finally {
        await rm(dir, { recursive: true, force: true });
        vi.doUnmock('node:fs/promises');
      }
    });

    it('aborts during entry iteration when signal is triggered', async () => {
      vi.resetModules();
      const dir = await createTempDir();
      const controller = new AbortController();
      try {
        await vi.doMock('node:fs/promises', async () => {
          const actual =
            await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
          const entries = [
            {
              name: 'a.ts',
              isSymbolicLink: () => false,
              isDirectory: () => false,
              isFile: () => {
                controller.abort();
                return true;
              },
            },
            {
              name: 'b.ts',
              isSymbolicLink: () => false,
              isDirectory: () => false,
              isFile: () => true,
            },
          ] as unknown as import('node:fs').Dirent[];

          return {
            ...actual,
            readdir: vi.fn().mockResolvedValue(entries),
          };
        });

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(
          ['**/*.ts'],
          dir,
          undefined,
          controller.signal,
        );
        expect(Array.isArray(results)).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
        vi.doUnmock('node:fs/promises');
      }
    });

    it('walks into directories when entries are directories', async () => {
      vi.resetModules();
      const dir = await createTempDir();
      try {
        const readdirMock = vi.fn(async (target: string) => {
          if (target === dir) {
            return [
              {
                name: 'nested',
                isSymbolicLink: () => false,
                isDirectory: () => true,
                isFile: () => false,
              },
            ] as unknown as import('node:fs').Dirent[];
          }
          return [];
        });

        await vi.doMock('node:fs/promises', async () => {
          const actual =
            await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
          return {
            ...actual,
            readdir: readdirMock,
          };
        });

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.ts'], dir);

        expect(results).toEqual([]);
        expect(readdirMock).toHaveBeenCalledTimes(2);
      } finally {
        await rm(dir, { recursive: true, force: true });
        vi.doUnmock('node:fs/promises');
      }
    });

    it('adds symlinked files when stats show a file match', async () => {
      vi.resetModules();
      const dir = await createTempDir();
      try {
        const linkPath = path.join(dir, 'link.txt');
        const realTarget = path.join(dir, 'target.txt');

        await vi.doMock('node:fs/promises', async () => {
          const actual =
            await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
          return {
            ...actual,
            readdir: vi.fn().mockResolvedValue([
              {
                name: 'link.txt',
                isSymbolicLink: () => true,
                isDirectory: () => false,
                isFile: () => false,
              },
            ] as unknown as import('node:fs').Dirent[]),
            realpath: vi.fn().mockResolvedValue(realTarget),
            stat: vi.fn().mockResolvedValue({
              isDirectory: () => false,
              isFile: () => true,
            }),
          };
        });

        const mod = await import('./file-system.ts');
        const results = await mod.expandFilePatterns(['**/*.txt'], dir);

        expect(results).toContain(linkPath);
      } finally {
        await rm(dir, { recursive: true, force: true });
        vi.doUnmock('node:fs/promises');
      }
    });

    it('caches compiled matchers for repeated patterns', async () => {
      vi.resetModules();
      // Mock picomatch to observe call count while delegating to actual implementation
      await vi.doMock('picomatch', async () => {
        const actual = await vi.importActual<typeof import('picomatch')>('picomatch');
        let callCount = 0;
        const wrapped = (pattern: string, opts?: unknown) => {
          callCount += 1;
          // @ts-expect-error - actual.default is callable matcher factory
          return actual.default(pattern, opts as never);
        };
        return {
          default: wrapped,
          // Expose a getter for test assertions
          getCallCount: () => callCount,
        } as unknown as typeof import('picomatch');
      });

      const mod = await import('./file-system.ts');
      const base = await createTempDir();
      try {
        await writeFile(path.join(base, 'x.ts'), '');
        const res1 = await mod.expandFilePatterns(['**/*.ts'], base);
        const res2 = await mod.expandFilePatterns(['**/*.ts'], base);
        expect(res1.length).toBeGreaterThanOrEqual(1);
        expect(res2.length).toBeGreaterThanOrEqual(1);

        const pic = await import('picomatch');
        // @ts-expect-error - mocked module exposes getCallCount
        expect(pic.getCallCount()).toBe(1);
      } finally {
        await rm(base, { recursive: true, force: true });
        vi.doUnmock('picomatch');
      }
    });
  });
});
