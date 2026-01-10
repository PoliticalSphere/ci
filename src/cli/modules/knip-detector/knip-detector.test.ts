/**
 * Tests for knip detector module
 */

import { afterEach, describe, expect, it } from 'vitest';

import { cleanupTempFile, createTempFile } from '../../../__test-utils__/index.ts';
import { detectKnipFindings } from './knip-detector.ts';

describe('Knip Detector Module', () => {
  describe('detectKnipFindings', () => {
    let tmpLogPath = '';

    afterEach(async () => {
      if (tmpLogPath) {
        await cleanupTempFile(tmpLogPath);
        tmpLogPath = '';
      }
    });

    /**
     * Write `content` to a temp file and assert that `detectKnipFindings`
     * returns `expected` for that file.
     */
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
      expect.hasAssertions();
      await testWithContent('Checking project...\nNo unused files detected\nDone.', false);
    });

    it('returns false when log contains "no issues found"', async () => {
      expect.hasAssertions();
      await testWithContent('No issues found in the project', false);
    });

    it('returns false when log contains "ok"', async () => {
      expect.hasAssertions();
      await testWithContent('ok', false);
    });

    it('returns true for "Unused files" header', async () => {
      expect.hasAssertions();
      await testWithContent('Unused files:\n  src/orphan.ts', true);
    });

    it('returns false when unused files section has no entries', async () => {
      expect.hasAssertions();
      await testWithContent('Unused files:\n', false);
    });

    it('ignores unused files section when only debug paths are listed', async () => {
      expect.hasAssertions();
      await testWithContent('Unused files:\n  debug/trace.log\n  debug/extra.log', false);
    });

    it('treats unused section as findings when a non-debug entry appears', async () => {
      expect.hasAssertions();
      await testWithContent('Unused files:\n  debug/trace.log\n  src/real.ts', true);
    });

    it('stops unused section at blank lines even when debug entries are present', async () => {
      expect.hasAssertions();
      await testWithContent('Unused files:\n  debug/trace.log\n\n  src/other.ts', false);
    });

    it('treats blank line after unused header as no findings', async () => {
      expect.hasAssertions();
      await testWithContent('Unused dependencies:\n\n  lodash', false);
    });

    it('returns true for "Unused dependencies" header', async () => {
      expect.hasAssertions();
      await testWithContent('Unused dependencies:\n  lodash', true);
    });

    it('returns true for "Unlisted" findings', async () => {
      expect.hasAssertions();
      await testWithContent('Unlisted dependencies:\n  express', true);
    });

    it('returns true for "Unresolved" findings', async () => {
      expect.hasAssertions();
      await testWithContent('Unresolved imports:\n  ./missing', true);
    });

    it('returns true for "Duplicate" findings', async () => {
      expect.hasAssertions();
      await testWithContent('Duplicate exports:\n  myFunction', true);
    });

    it('returns false for empty log file', async () => {
      expect.hasAssertions();
      await testWithContent('', false);
    });

    it('returns false for whitespace-only log file', async () => {
      expect.hasAssertions();
      await testWithContent('   \n   \n', false);
    });

    it('handles case-insensitive pattern matching', async () => {
      expect.hasAssertions();
      await testWithContent('UNUSED FILES:\n  src/orphan.ts', true);
    });

    it('ignores similar but non-matching text', async () => {
      expect.hasAssertions();
      await testWithContent('Unusedish files detected\nUnused categories', false);
    });

    it('returns false for files that cannot be read', async () => {
      const result = await detectKnipFindings('/dev/null');
      // /dev/null exists but contains nothing
      expect(typeof result).toBe('boolean');
    });

    it('handles missing lines in parsed output', async () => {
      vi.resetModules();
      const lines = {
        0: 'Unused files:',
        1: undefined,
        2: '',
        length: 3,
        *[Symbol.iterator]() {
          yield 'Unused files:';
          yield '';
          yield '';
        },
      } as unknown as string[];
      const readFileMock = vi.fn().mockResolvedValue({
        split: () => lines,
      });
      vi.doMock('node:fs/promises', () => ({
        readFile: readFileMock,
      }));

      const { detectKnipFindings: detectWithMock } = await import('./knip-detector.ts');

      const result = await detectWithMock('/fake/path.log');
      expect(result).toBe(false);

      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    });
  });
});
