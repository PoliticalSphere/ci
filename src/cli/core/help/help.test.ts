import { describe, expect, it, vi } from 'vitest';

/**
 * Tests for `help.ts` helpers (`showHelp` / `showVersion`).
 *
 * These tests mock the linter registry and filesystem reads to verify
 * formatting, escaping, and version fallback behaviour without touching
 * real configuration or files.
 */
describe('help.ts', () => {
  it('re-exports showHelp from formatter', async () => {
    vi.resetModules();

    const helpMod = await import('./help.ts');
    const formatterMod = await import('./formatter.ts');

    expect(helpMod.showHelp).toBe(formatterMod.showHelp);
  });

  it('builds showVersion from getPackageVersion', async () => {
    vi.resetModules();

    vi.doMock('../version/version.ts', () => ({
      getPackageVersion: () => '9.9.9',
    }));

    try {
      const { showVersion } = await import('./help.ts');
      expect(showVersion()).toBe('@politicalsphere/ci v9.9.9');
    } finally {
      vi.doUnmock('../version/version.ts');
      vi.resetModules();
    }
  });

  it('includes available linters from configuration in the help output', async () => {
    vi.resetModules();

    vi.doMock('../../config/index.ts', () => ({
      getAllLinterIds: () => ['eslint', 'biome'],
    }));

    try {
      const { showHelp } = await import('./help.ts');

      const help = showHelp();

      expect(help).toContain('Available: eslint, biome');
    } finally {
      vi.doUnmock('../../config/index.ts');
      vi.resetModules();
    }
  });

  it('handles empty linter registries in the help output', async () => {
    vi.resetModules();

    vi.doMock('../../config/index.ts', () => ({
      getAllLinterIds: () => [],
    }));

    try {
      const { showHelp } = await import('./help.ts');

      const help = showHelp();

      expect(help).toContain('Available:');
    } finally {
      vi.doUnmock('../../config/index.ts');
      vi.resetModules();
    }
  });

  it('handles long linter lists in the help output', async () => {
    vi.resetModules();

    const longList = Array.from({ length: 50 }, (_, i) => `linter-${i + 1}`);
    vi.doMock('../../config/index.ts', () => ({
      getAllLinterIds: () => longList,
    }));

    try {
      const { showHelp } = await import('./help.ts');

      const help = showHelp();

      expect(help).toContain('linter-1');
      expect(help).toContain('linter-50');
    } finally {
      vi.doUnmock('../../config/index.ts');
      vi.resetModules();
    }
  });

  it('escapes special characters in linter ids for help output', async () => {
    vi.resetModules();

    vi.doMock('../../config/index.ts', () => ({
      getAllLinterIds: () => ['ok', 'bad\nid', 'weird💥'],
    }));

    try {
      const { showHelp } = await import('./help.ts');

      const help = showHelp();

      expect(help).toContain('ok');
      expect(help).not.toContain('bad\nid');
      expect(help).not.toContain('💥');
    } finally {
      vi.doUnmock('../../config/index.ts');
      vi.resetModules();
    }
  });

  it('strips non-printable characters via escapeHelpToken', async () => {
    vi.resetModules();

    vi.doMock('../../config/index.ts', () => ({
      getAllLinterIds: () => ['clean', 'bad\tid', 'line\rbreak'],
    }));

    try {
      const { showHelp } = await import('./help.ts');

      const help = showHelp();

      expect(help).toContain('clean');
      expect(help).not.toContain('\t');
      expect(help).not.toContain('\r');
    } finally {
      vi.doUnmock('../../config/index.ts');
      vi.resetModules();
    }
  });

  it('returns a version string from showVersion', async () => {
    const { showVersion } = await import('./help.ts');
    const version = showVersion();

    expect(version).toMatch(/^@politicalsphere\/ci v\d+\.\d+\.\d+$/);
  });

  it('falls back to unknown when package.json has no version', async () => {
    vi.resetModules();
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        readFileSync: vi.fn(() => JSON.stringify({})),
      };
    });

    try {
      const { showVersion } = await import('./help.ts');
      expect(showVersion()).toBe('@politicalsphere/ci vunknown');
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('throws when package.json resolves outside the repo root', async () => {
    vi.resetModules();
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/not-the-repo');

    await expect(import('./help.ts')).rejects.toThrow(/outside the repo root/);

    cwdSpy.mockRestore();
    vi.resetModules();
  });
});
