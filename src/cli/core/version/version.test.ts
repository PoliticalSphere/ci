/**
 * Tests for the CLI `version` helper.
 *
 * These tests validate two behaviors:
 * - the package version is read from `package.json` and cached for
 *   subsequent calls (avoiding repeated filesystem reads), and
 * - when the package file cannot be read the module falls back to the
 *   `PKG_VERSION_FALLBACK` value and logs an error.
 */
import { describe, expect, it, vi } from 'vitest';

import { PKG_VERSION_FALLBACK } from '../../constants/paths.ts';

describe('version module', () => {
  afterEach(() => {
    // Restore spies/mocks and clear module cache between tests so each
    // `import('./version.ts')` observes a fresh module instance.
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns cached package version on subsequent reads', async () => {
    // Mock `fs.readFileSync` to return a stable package.json payload.
    vi.doMock('node:fs', () => ({
      readFileSync: vi.fn(() => JSON.stringify({ version: '1.2.3' })),
    }));

    vi.unmock('./version.ts');
    const mod = await import('./version.ts');
    const fs = await import('node:fs');
    const readSpy = vi.mocked(fs.readFileSync);

    // The version is read once at module load and cached in `PKG_VERSION`.
    expect(mod.getPackageVersion()).toBe('1.2.3');
    expect(mod.getPackageVersion()).toBe('1.2.3');
    expect(readSpy).toHaveBeenCalledTimes(1);

    vi.doUnmock('node:fs');
  });

  it('falls back and logs when package version cannot be read', async () => {
    // Spy on console.error so we can assert an informative log occurs.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Force `fs.readFileSync` to throw so the fallback path is exercised.
    vi.doMock('node:fs', () => ({
      readFileSync: vi.fn(() => {
        throw new Error('boom');
      }),
    }));

    const mod = await vi.importActual<typeof import('./version.ts')>('./version.ts');

    expect(mod.getPackageVersion()).toBe(PKG_VERSION_FALLBACK);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read package.json'));

    vi.doUnmock('node:fs');
  });

  it('throws when package.json resolves outside the repo root', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/not-the-repo');

    await expect(vi.importActual<typeof import('./version.ts')>('./version.ts')).rejects.toThrow(
      /outside the repo root/,
    );

    cwdSpy.mockRestore();
    vi.resetModules();
  });

  it('uses fallback when version property is missing without logging error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('node:fs', () => ({
      readFileSync: vi.fn(() => JSON.stringify({})),
    }));

    const mod = await vi.importActual<typeof import('./version.ts')>('./version.ts');

    expect(mod.getPackageVersion()).toBe(PKG_VERSION_FALLBACK);
    expect(errorSpy).not.toHaveBeenCalled();

    vi.doUnmock('node:fs');
  });
  it('coerces numeric version values to strings', async () => {
    vi.doMock('node:fs', () => ({
      readFileSync: vi.fn(() => JSON.stringify({ version: 52 })),
    }));

    const mod = await import('./version.ts');

    // Module exports the resolved package version (cached at load time)
    expect(mod.getPackageVersion()).toBe('52');

    vi.doUnmock('node:fs');
  });

  it('direct call to getPkgVersion returns cached value (early-return path)', async () => {
    // Ensure the module cache is fresh and fs returns a stable version
    vi.doMock('node:fs', () => ({
      readFileSync: vi.fn(() => JSON.stringify({ version: '9.9.9' })),
    }));

    const mod = await import('./version.ts');
    const fs = await import('node:fs');
    const readSpy = vi.mocked(fs.readFileSync);

    // Module-level PKG_VERSION is initialized at import time
    expect(mod.getPackageVersion()).toBe('9.9.9');

    // Directly calling the internal helper should hit the early-return path
    expect(mod.__test__.getPkgVersion()).toBe('9.9.9');

    // fs.readFileSync should only have been called once (cached path exercised)
    expect(readSpy).toHaveBeenCalledTimes(1);

    vi.doUnmock('node:fs');
  });
});
