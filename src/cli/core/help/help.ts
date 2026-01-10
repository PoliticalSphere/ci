/**
 * Political Sphere — Help & Version API
 *
 * Role:
 *   Re-export public API for help and version functions.
 *
 * Responsibilities:
 *   - Provide single entry point for CLI output functions
 */

/* biome-ignore assist/source/organizeImports: Keep manual import/export ordering for readability */
import { getPackageVersion } from '../version/version.ts';
export { showHelp } from './formatter.ts';

/**
 * Return the CLI package version string for `--version` output.
 *
 * The version is obtained from the repository's `package.json` via
 * `getPackageVersion()`. If the version cannot be determined the
 * implementation falls back to a sentinel value (see `version.ts`).
 *
 * @returns {string} A human-friendly version string like `@politicalsphere/ci v1.2.3`.
 */
export function showVersion(): string {
  return `@politicalsphere/ci v${getPackageVersion()}`;
}
