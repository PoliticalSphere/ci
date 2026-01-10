import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { expandFilePatterns } from './file-system.ts';

const createTempDir = async (): Promise<string> => mkdtemp(path.join(tmpdir(), 'ci-fs-cover-'));

describe('expandFilePatterns coverage', () => {
  afterEach(async () => {
    // Ensure no stray temp dirs remain; individual tests clean up explicitly.
  });

  it('traverses directories and records nested files', async () => {
    const base = await createTempDir();
    try {
      const nested = path.join(base, 'nested');
      await mkdir(nested);
      await writeFile(path.join(nested, 'deep.txt'), 'deep');

      const results = await expandFilePatterns(['**/*.txt'], base);
      expect(results.some((p) => p.endsWith('/nested/deep.txt'))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('handles symlinked files via the symlink branch', async () => {
    const base = await createTempDir();
    try {
      const real = path.join(base, 'target.txt');
      await writeFile(real, 't');
      const link = path.join(base, 'link.txt');
      await symlink(real, link);

      const entries = await readdir(base, { withFileTypes: true });
      const linkEntry = entries.find((entry) => entry.name === 'link.txt');
      expect(linkEntry?.isSymbolicLink()).toBe(true);

      const results = await expandFilePatterns(['**/*.txt'], base);
      expect(results).toContain(link);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
