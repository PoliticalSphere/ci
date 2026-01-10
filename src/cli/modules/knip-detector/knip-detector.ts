/**
 * Knip-specific findings detection.
 * Analyzes knip output logs to determine if actual findings were discovered.
 */

import { readFile } from 'node:fs/promises';

/* eslint-disable security/detect-object-injection -- Controlled use of trusted regex patterns and file paths */

/** Return true when the log contains a clear success indicator. */
function hasExplicitSuccess(lines: string[]): boolean {
  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (lower.includes('no unused') || lower.includes('no issues found') || lower === 'ok') {
      return true;
    }
  }
  return false;
}

/**
 * Inspect following lines after an "Unused files" section header to detect
 * whether any non-debug files are listed (indicates a real finding).
 */
function hasMeaningfulUnusedFiles(lines: string[], startIdx: number): boolean {
  for (let j = startIdx + 1; j < lines.length; j += 1) {
    const candidate = (lines[j] ?? '').trim();
    if (candidate === '') {
      break;
    }
    if (!candidate.startsWith('debug/') && candidate !== '') {
      return true;
    }
  }
  return false;
}

/** Check for other finding categories such as "unlisted" or "unresolved". */
function hasOtherFindings(lines: string[]): boolean {
  const findingPatterns = [/^unlisted\s+/i, /^unresolved\s+/i, /^duplicate\s+/i];
  for (const line of lines) {
    const trimmed = line.trim();
    for (const pattern of findingPatterns) {
      // Safe use of trusted regex patterns: the `findingPatterns` array is
      // static and not derived from external input (no object injection risk).
      if (pattern.test(trimmed)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Parse a knip log file and return `true` when findings are detected.
 *
 * Returns `false` on parse errors or when no findings are present.
 */
export async function detectKnipFindings(logPath: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- logPath is derived from controlled linter IDs and a validated log directory
    const content = await readFile(logPath, 'utf8');
    const lines = content.split('\n');

    // Explicit success message short-circuits
    if (hasExplicitSuccess(lines)) {
      return false;
    }

    // Detect `Unused files` and `Unused dependencies` sections, ignoring debug-only hits
    for (let idx = 0; idx < lines.length; idx += 1) {
      const trimmed = (lines[idx] ?? '').trim();
      if (
        /^unused\s+(?:files|dependencies)/i.test(trimmed) &&
        hasMeaningfulUnusedFiles(lines, idx)
      ) {
        return true;
      }
    }

    // Generic checks for other finding categories
    if (hasOtherFindings(lines)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
