/**
 * File system utilities for checking file presence.
 * Used by skip logic to determine if linters should run.
 */

import { readdir, stat } from 'node:fs/promises';
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

export async function directoryExists(path: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path comes from caller input.
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

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

function fileMatchesExtensions(filename: string, extensions: readonly string[]): boolean {
  const lowerName = filename.toLowerCase();
  return extensions.some((ext) =>
    ext.includes('*') ? matchesPattern(lowerName, ext) : lowerName.endsWith(ext),
  );
}

export function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return filename.startsWith(pattern.slice(0, -1).toLowerCase());
  }
  /* v8 ignore next */
  return filename === pattern.toLowerCase();
}

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
