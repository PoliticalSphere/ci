/**
 * Political Sphere — CLI Validation
 *
 * Role:
 *   Validate linter selections and directory paths.
 *
 * Responsibilities:
 *   - Resolve requested linters from registry
 *   - Validate linter IDs exist and are not duplicated
 *   - Ensure directory paths are safe (no directory traversal)
 */

import fs from 'node:fs';
import path from 'node:path';
import { CliError } from '../../errors/errors.ts';
import type { LinterConfig } from '../config/index.ts';
import { getAllLinterIds, getLinterById, LINTER_REGISTRY } from '../config/index.ts';

/**
 * Resolve requested linter ids into their canonical configs (or all
 * registry entries when none are requested). Throws when ids are invalid,
 * duplicated, or otherwise malformed.
 *
 * @param input - Optional comma-separated linter ids from CLI args.
 * @param registry - Optional registry overrides for testing.
 * @param registry.getAllIds - Optional function that returns all linter ids from the registry.
 * @param registry.getById - Optional function that returns a linter config by id.
 * @param registry.getRegistry - Optional function that returns the full registry array.
 */
export function resolveLinters(
  input?: readonly string[],
  registry?: {
    readonly getAllIds?: () => readonly string[];
    readonly getById?: (id: string) => LinterConfig | undefined;
    readonly getRegistry?: () => readonly LinterConfig[];
  },
): readonly LinterConfig[] {
  if (!input || input.length === 0) {
    const list = registry?.getRegistry ? registry.getRegistry() : LINTER_REGISTRY;
    // Always fail ESLint on warnings
    return list.map((l) =>
      l.id === 'eslint'
        ? { ...l, args: [...l.args, '--max-warnings', '0'] as readonly string[] }
        : l,
    );
  }

  const requested = input.flatMap((s) => s.split(',').map((id) => id.trim()));
  if (requested.some((id) => id.length === 0)) {
    throw new CliError('CLI_INVALID_ARGUMENT', 'Empty linter IDs are not allowed');
  }

  const valid = new Set(registry?.getAllIds ? registry.getAllIds() : getAllLinterIds());
  const invalid = requested.filter((id) => !valid.has(id));

  if (invalid.length > 0) {
    throw new CliError(
      'CLI_INVALID_ARGUMENT',
      `Invalid linter IDs: ${invalid.join(', ')}\nValid linters: ${[...valid].join(', ')}`,
    );
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of requested) {
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }

  if (duplicates.size > 0) {
    throw new CliError(
      'CLI_INVALID_ARGUMENT',
      `Duplicate linter IDs: ${[...duplicates].join(', ')}`,
    );
  }

  const resolved = requested
    .map((id) => (registry?.getById ? registry.getById(id) : getLinterById(id)))
    .filter((linter): linter is NonNullable<typeof linter> => linter != null);

  // Always fail ESLint on warnings
  return resolved.map((l) =>
    l.id === 'eslint' ? { ...l, args: [...l.args, '--max-warnings', '0'] as readonly string[] } : l,
  );
}

/**
 * Ensure that `inputPath` resolves to a directory that lives under `baseDir`.
 *
 * This protects against directory traversal attacks and symlink tricks by
 * checking the resolved path (and realpath) relative to the base directory.
 *
 * @param baseDir - Path that all log directories must reside within.
 * @param inputPath - Candidate path provided via CLI args.
 * @returns Resolved, safe path string.
 * @throws {CliError} when the resolved path escapes the base directory.
 */
export function ensureSafeDirectoryPath(baseDir: string, inputPath: string): string {
  const resolvedBase = path.resolve(baseDir);

  // Reject obvious Windows-style traversal attempts on non-Windows platforms
  if (path.sep !== '\\' && inputPath.includes('\\')) {
    throw new CliError('CLI_INVALID_PATH', `Log directory must be within ${resolvedBase}`, {
      details: { resolvedBase, inputPath },
    });
  }

  const resolvedPath = path.resolve(resolvedBase, inputPath);
  const relativePath = path.relative(resolvedBase, resolvedPath);

  const isOutside =
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (isOutside) {
    throw new CliError('CLI_INVALID_PATH', `Log directory must be within ${resolvedBase}`, {
      details: { resolvedBase, inputPath },
    });
  }

  // If the resolved path includes symlinks, resolve them to detect symlink traversal
  {
    let realResolved: string | undefined;
    try {
      // realpathSync is used to resolve symlinks; argument is sanitized above so this is safe
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      realResolved = fs.realpathSync(resolvedPath);
    } catch {
      realResolved = undefined;
    }

    if (realResolved !== undefined) {
      const relativeReal = path.relative(resolvedBase, realResolved);
      const realIsOutside =
        relativeReal === '..' ||
        relativeReal.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeReal);

      /* c8 ignore next */
      if (realIsOutside) {
        throw new CliError('CLI_INVALID_PATH', `Log directory must be within ${resolvedBase}`, {
          details: { resolvedBase, inputPath },
        });
      }
    }
  }

  return resolvedPath;
}
