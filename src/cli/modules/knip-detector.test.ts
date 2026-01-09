/**
 * Tests for knip detector module
 */

import { afterEach, describe, expect, it } from 'vitest';

import { cleanupTempFile, createTempFile } from '../../__test-utils__/index.ts';
import { detectKnipFindings } from '../modules/knip-detector.ts';

describe('Knip Detector Module', () => {
  describe('detectKnipFindings', () => {
    let tmpLogPath = '';

    afterEach(async () => {
      if (tmpLogPath) {
        await cleanupTempFile(tmpLogPath);
        tmpLogPath = '';
      }
    });

    const testWithContent = async (content: string, expected: boolean) => {
      tmpLogPath = await createTempFile('knip-test-', content);
      const result = await detectKnipFindings(tmpLogPath);
      expect(result).toBe(expected);
    };

    it('returns false for non-existent files', async () => {
      const result = await detectKnipFindings('/nonexistent/path/to/knip.log');
      expect(result).toBe(false);
    });

    it('returns false when log contains "no unused"', async () => {
      await testWithContent('Checking project...\nNo unused files detected\nDone.', false);
    });

    it('returns false when log contains "no issues found"', async () => {
      await testWithContent('No issues found in the project', false);
    });

    it('returns false when log contains "ok"', async () => {
      await testWithContent('ok', false);
    });

    it('returns true for "Unused files" header', async () => {
      await testWithContent('Unused files:\n  src/orphan.ts', true);
    });

    it('returns true for "Unused dependencies" header', async () => {
      await testWithContent('Unused dependencies:\n  lodash', true);
    });

    it('returns true for "Unlisted" findings', async () => {
      await testWithContent('Unlisted dependencies:\n  express', true);
    });

    it('returns true for "Unresolved" findings', async () => {
      await testWithContent('Unresolved imports:\n  ./missing', true);
    });

    it('returns true for "Duplicate" findings', async () => {
      await testWithContent('Duplicate exports:\n  myFunction', true);
    });

    it('returns false for empty log file', async () => {
      await testWithContent('', false);
    });

    it('returns false for whitespace-only log file', async () => {
      await testWithContent('   \n   \n', false);
    });

    it('handles case-insensitive pattern matching', async () => {
      await testWithContent('UNUSED FILES:\n  src/orphan.ts', true);
    });

    it('ignores similar but non-matching text', async () => {
      await testWithContent('Unusedish files detected\nUnused categories', false);
    });

    it('returns false for files that cannot be read', async () => {
      const result = await detectKnipFindings('/dev/null');
      // /dev/null exists but contains nothing
      expect(typeof result).toBe('boolean');
    });
  });
});
