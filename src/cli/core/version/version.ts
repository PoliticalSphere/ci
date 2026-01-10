/**
 * Political Sphere — Version Management
 *
 * Role:
 *   Lazy-load and cache package version information.
 *
 * Responsibilities:
 *   - Validate package.json path at import time
 *   - Read and cache version on first access
 *   - Return formatted version string
 *
 * Security:
 *   - Path is validated to ensure it's within the repo root (prevents path traversal)
 *   - File path is constant (PKG_FILENAME = 'package.json') so ESLint can verify safety
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CliError } from '../../../errors/errors.ts';
import { PKG_FILENAME, PKG_VERSION_FALLBACK } from '../../constants/paths.js';

let cachedPkgVersion: string | undefined;

// Validate package.json path at import time to fail fast
// SECURITY: This path is validated to prevent path traversal attacks.
// The path is constructed using a constant filename (PKG_FILENAME = 'package.json')
// so ESLint can verify that no user input flows into this path construction.
const pkgUrl = new URL(`../../../../${PKG_FILENAME}`, import.meta.url);
const pkgPath = fileURLToPath(pkgUrl);
const repoRoot = path.resolve(process.cwd());
if (!pkgPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new CliError(
    'CLI_INVALID_PATH',
    `Resolved ${PKG_FILENAME} path is outside the repo root: ${pkgPath}`,
    { details: { filePath: pkgPath, context: { repoRoot } } },
  );
}

/**
 * Read and cache the package version from package.json.
 *
 * This function is called once at module load; it falls back to
 * `PKG_VERSION_FALLBACK` when the file cannot be read and logs the
 * failure so operators can diagnose the missing metadata.
 *
 * @returns A semantic version string or the fallback sentinel.
 */
function getPkgVersion(): string {
  if (cachedPkgVersion !== undefined) {
    return cachedPkgVersion;
  }
  try {
    // SECURITY: Path is validated at module load time (see above)
    // Using constant PKG_FILENAME ensures no user input flows here
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    cachedPkgVersion = String(pkg.version ?? PKG_VERSION_FALLBACK);
  } catch (error) {
    // Log the error for debugging purposes but continue with fallback
    console.error(`[version] Failed to read ${PKG_FILENAME}: ${String(error)}`);
    cachedPkgVersion = PKG_VERSION_FALLBACK;
  }
  return cachedPkgVersion;
}

const PKG_VERSION = getPkgVersion();

/**
 * Public accessor for the resolved package version.
 *
 * This value is computed once at module-load and cached in `PKG_VERSION`.
 * Consumers may call `getPackageVersion()` safely without triggering
 * additional filesystem reads.
 */
export function getPackageVersion(): string {
  return PKG_VERSION;
}

/**
 * Test-only helpers that expose private helpers without reloading the module.
 *
 * `getPkgVersion` is the core helper that reads/caches the package version
 * and is useful for validating fallback and caching logic in unit tests.
 */
export const __test__ = {
  getPkgVersion,
};
