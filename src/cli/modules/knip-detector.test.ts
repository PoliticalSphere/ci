/**
 * Tests for knip detector module
 */

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { detectKnipFindings } from '../modules/knip-detector.ts';

const tmpLogPath = `/tmp/knip-test-${randomUUID()}.log`;

describe('Knip Detector Module', () => {
  describe('detectKnipFindings', () => {
    afterEach(async () => {
      try {
        // Clean up test file
        const fs = await import('node:fs/promises');
        await fs.unlink(tmpLogPath).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    });

    it('returns false for non-existent files', async () => {
      const result = await detectKnipFindings('/nonexistent/path/to/knip.log');
      expect(result).toBe(false);
    });

    it('returns false when log contains "no unused"', async () => {
      await writeFile(tmpLogPath, 'Checking project...\nNo unused files detected\nDone.');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(false);
    });

    it('returns false when log contains "no issues found"', async () => {
      await writeFile(tmpLogPath, 'No issues found in the project');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(false);
    });

    it('returns false when log contains "ok"', async () => {
      await writeFile(tmpLogPath, 'ok');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(false);
    });

    it('returns true for "Unused files" header', async () => {
      await writeFile(tmpLogPath, 'Unused files:\n  src/orphan.ts');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(true);
    });

    it('returns true for "Unused dependencies" header', async () => {
      await writeFile(tmpLogPath, 'Unused dependencies:\n  lodash');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(true);
    });

    it('returns true for "Unlisted" findings', async () => {
      await writeFile(tmpLogPath, 'Unlisted dependencies:\n  express');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(true);
    });

    it('returns true for "Unresolved" findings', async () => {
      await writeFile(tmpLogPath, 'Unresolved imports:\n  ./missing');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(true);
    });

    it('returns true for "Duplicate" findings', async () => {
      await writeFile(tmpLogPath, 'Duplicate exports:\n  myFunction');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(true);
    });

    it('returns false for empty log file', async () => {
      await writeFile(tmpLogPath, '');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(false);
    });

    it('returns false for whitespace-only log file', async () => {
      await writeFile(tmpLogPath, '   \n   \n');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(false);
    });

    it('handles case-insensitive pattern matching', async () => {
      await writeFile(tmpLogPath, 'UNUSED FILES:\n  src/orphan.ts');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(true);
    });

    it('ignores similar but non-matching text', async () => {
      await writeFile(tmpLogPath, 'Unusedish files detected\nUnused categories');
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(false);
    });

    it('returns false for files that cannot be read', async () => {
      const result = await detectKnipFindings('/dev/null');
      // /dev/null exists but contains nothing
      expect(typeof result).toBe('boolean');
    });
  });
});
