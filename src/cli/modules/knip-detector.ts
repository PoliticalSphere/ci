/**
 * Knip-specific findings detection.
 * Analyzes knip output logs to determine if actual findings were discovered.
 */

import { readFile } from 'node:fs/promises';

export async function detectKnipFindings(logPath: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- logPath is derived from controlled linter IDs and a validated log directory
    const content = await readFile(logPath, 'utf8');
    const lines = content.split('\n');

    // Check for explicit success message
    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      if (lower.includes('no unused') || lower.includes('no issues found') || lower === 'ok') {
        return false;
      }
    }

    // Check for finding indicators:
    // - Lines starting with category headers like "Unused files", "Unused dependencies"
    // - Lines containing file paths after finding headers
    const findingPatterns = [
      /^unused\s+(files|dependencies|devdependencies|exports|types)/i,
      /^unlisted\s+/i,
      /^unresolved\s+/i,
      /^duplicate\s+/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      for (const pattern of findingPatterns) {
        if (pattern.test(trimmed)) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
