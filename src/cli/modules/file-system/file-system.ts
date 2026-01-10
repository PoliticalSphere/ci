/**
 * File system utilities for checking file presence.
 * Used by skip logic to determine if linters should run.
 */

import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.ps-platform', 'dist', 'build', 'coverage']);

// Default maximum recursion depth for directory traversal. Can be overridden
// via the `PS_FS_MAX_DEPTH` environment variable for CI or local tweaks.
export const DEFAULT_MAX_DEPTH = (() => {
  // Cast `process.env` to a specific shape so we can safely use dot-notation
  // without triggering TS4111 (index-signature access) while keeping the
  // code explicit about the expected type.
  const v = (process.env as unknown as { PS_FS_MAX_DEPTH?: string }).PS_FS_MAX_DEPTH;
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    if (!Number.isNaN(n) && Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return 10;
})();

/**
 * Determine whether the provided path exists and is a directory.
 *
 * Returns `true` when the path exists and is a directory, otherwise `false`.
 */
export async function directoryExists(path: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path comes from caller input.
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively check whether a directory contains files matching any of the
 * provided extensions. Traversal respects `IGNORED_DIRS` and a configurable
 * `maxDepth` to avoid unbounded recursion.
 *
 * @param dir - Directory path to scan.
 * @param extensions - File extensions or patterns to match.
 * @param maxDepth - Optional maximum recursion depth.
 * @returns `true` when a matching file is found; otherwise `false`.
 */
export async function hasFilesWithExtensions(
  dir: string,
  extensions: readonly string[],
  maxDepth?: number,
): Promise<boolean> {
  const depth = typeof maxDepth === 'number' ? maxDepth : DEFAULT_MAX_DEPTH;

  if (depth <= 0) {
    return false;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Directory is validated by caller.
    const entries = await readdir(dir, { withFileTypes: true });
    return containsMatchingEntry(entries, dir, extensions, depth);
  } catch {
    // Directory unreadable or doesn't exist
  }

  return false;
}

/**
 * Scan directory entries recursively for a file that matches one of the extensions.
 */
async function containsMatchingEntry(
  entries: readonly import('node:fs').Dirent[],
  dir: string,
  extensions: readonly string[],
  maxDepth: number,
): Promise<boolean> {
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    if (entry.isFile() && fileMatchesExtensions(entry.name, extensions)) {
      return true;
    }

    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name);
      const found = await hasFilesWithExtensions(fullPath, extensions, maxDepth - 1);
      if (found) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determine if a filename matches any of the requested extensions or patterns.
 */
function fileMatchesExtensions(filename: string, extensions: readonly string[]): boolean {
  const lowerName = filename.toLowerCase();
  return extensions.some((ext) =>
    ext.includes('*') ? matchesPattern(lowerName, ext) : lowerName.endsWith(ext),
  );
}

/**
 * Simple pattern matcher used by the file expansion utilities. The pattern
 * syntax supports a trailing '*' pattern to indicate prefix matching.
 */
export function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return filename.startsWith(pattern.slice(0, -1).toLowerCase());
  }
  /* v8 ignore next */
  return filename === pattern.toLowerCase();
}

/**
 * Non-recursive check: determine whether `dir` contains any files whose
 * names end with one of the provided `extensions`.
 */
export async function hasFilesInDir(dir: string, extensions: readonly string[]): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Directory is validated by caller.
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();
        for (const ext of extensions) {
          if (lowerName.endsWith(ext)) {
            return true;
          }
        }
      }
    }
  } catch {
    // Directory unreadable
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* File-pattern expansion (glob-like)                                          */
/* -------------------------------------------------------------------------- */
import picomatch from 'picomatch';

const matcherCache = new Map<string, (input: string) => boolean>();

/**
 * Compile (and cache) picomatch matchers for the provided glob-like patterns.
 */
function getMatchers(patterns: readonly string[]): Array<(input: string) => boolean> {
  return patterns.map((pattern) => {
    const cached = matcherCache.get(pattern);
    if (cached) {
      return cached;
    }
    const compiled = picomatch(pattern, { dot: true });
    matcherCache.set(pattern, compiled);
    return compiled;
  });
}

/* eslint-disable sonarjs/cognitive-complexity -- Complex directory traversal logic is clearer when kept together */
/**
 * Expand glob-like `patterns` into a list of matching filesystem paths.
 *
 * - `baseDir` is the root directory for relative pattern matching.
 * - `maxDepth` limits recursive traversal depth.
 * - `signal` can be used to abort a long-running expansion.
 */
export async function expandFilePatterns(
  patterns: readonly string[] | undefined,
  baseDir = process.cwd(),
  maxDepth = DEFAULT_MAX_DEPTH,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!patterns || patterns.length === 0) {
    return [];
  }
  if (signal?.aborted ?? false) {
    return [];
  }

  const matchers = getMatchers(patterns);
  const results: string[] = [];

  // baseDir is supplied by caller (validated earlier); allow non-literal realpath here.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- baseDir provided by caller
  const resolvedBase = await realpath(baseDir).catch(() => path.resolve(baseDir));

  /**
   * Depth-first traversal implementing the glob expansion rules.
   */
  async function walk(dir: string, depth: number): Promise<void> {
    /**
     * Recursively traverse directories while respecting signal and depth limits.
     */
    if (depth <= 0) {
      return;
    }
    if (signal?.aborted ?? false) {
      return;
    }
    let entries: import('node:fs').Dirent[];
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- baseDir is provided by caller
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (signal?.aborted === true) {
        return;
      }
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
      let isSymlinkHandled = false;

      if (entry.isSymbolicLink()) {
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- fullPath is derived from repo paths
          const real = await realpath(fullPath);
          if (!real.startsWith(`${resolvedBase}${path.sep}`) && real !== resolvedBase) {
            continue;
          }
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- fullPath is derived from repo paths
          const stats = await stat(fullPath);
          if (stats.isDirectory()) {
            await walk(fullPath, depth - 1);
            isSymlinkHandled = true;
          } else if (stats.isFile()) {
            /* c8 ignore next */
            if (matchers.some((m) => m(rel))) {
              results.push(fullPath);
            }
            isSymlinkHandled = true;
          }
        } catch {
          continue;
        }
      }

      if (isSymlinkHandled) {
        continue;
      }

      if (entry.isFile()) {
        if (matchers.some((m) => m(rel))) {
          results.push(fullPath);
        }
        /* c8 ignore next */
      } else if (entry.isDirectory()) {
        await walk(fullPath, depth - 1);
      }
    }
  }

  await walk(baseDir, maxDepth);
  return results;
}
/* eslint-enable sonarjs/cognitive-complexity */
