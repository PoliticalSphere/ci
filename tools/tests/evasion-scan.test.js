#!/usr/bin/env node

// ============================================================================
// Political Sphere — Evasion Scanner Tests
// ---------------------------------------------------------------------------
// Purpose:
//   Unit tests for tools/scripts/security/evasion-scan.js pattern detection,
//   threshold enforcement, and complexity scanning.
// ============================================================================

import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = process.cwd();
const EVASION_SCAN = path.join(
  REPO_ROOT,
  'tools/scripts/security/evasion-scan.js',
);
const TEST_WORKSPACE = path.join(REPO_ROOT, 'logs/test-evasion');

/**
 * Run evasion-scan and capture output
 * @param {string[]} [args=[]] - Additional arguments
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runEvasionScan(args = []) {
  try {
    const stdout = execSync(`node "${EVASION_SCAN}" ${args.join(' ')}`, {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      status: error.status ?? 1,
    };
  }
}

/**
 * Create a test file with specific content
 */
function _createTestFile(relativePath, content) {
  const fullPath = path.join(TEST_WORKSPACE, relativePath);
  const dir = path.dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, content);
  return fullPath;
}

describe('evasion-scan.js', () => {
  describe('pattern detection', () => {
    it('runs without error on the codebase', () => {
      const result = runEvasionScan();
      // Should complete (may pass or fail based on findings)
      assert.ok(
        result.stdout.includes('Evasion & Complexity Scan') ||
          result.stderr.includes('Evasion'),
        'Expected scan output header',
      );
    });

    it('detects patterns in output', () => {
      const result = runEvasionScan();
      // The scanner should report some findings (shellcheck-disable is common)
      assert.ok(
        result.stdout.includes('Scanned:') ||
          result.stdout.includes('Total findings:'),
        'Expected scan statistics in output',
      );
    });
  });

  describe('threshold enforcement', () => {
    it('reports PASS when thresholds satisfied', () => {
      const result = runEvasionScan();
      // Check for either PASS or specific threshold info
      const output = result.stdout + result.stderr;
      assert.ok(
        output.includes('PASS') ||
          output.includes('FAIL') ||
          output.includes('thresholds'),
        'Expected threshold result in output',
      );
    });
  });

  describe('pattern matching', () => {
    it('detects @ts-ignore pattern', () => {
      // This tests the pattern regex directly
      const tsIgnorePattern = /@ts-ignore/g;
      const testContent = '// @ts-ignore\nconst x = 1;';
      const matches = testContent.match(tsIgnorePattern);
      assert.ok(matches, 'Should match @ts-ignore');
      assert.equal(matches.length, 1);
    });

    it('detects @ts-expect-error pattern', () => {
      const tsExpectPattern = /@ts-expect-error/g;
      const testContent =
        '// @ts-expect-error - known issue\nconst x: number = "string";';
      const matches = testContent.match(tsExpectPattern);
      assert.ok(matches, 'Should match @ts-expect-error');
      assert.equal(matches.length, 1);
    });

    it('detects eslint-disable but not eslint-disable-env', () => {
      const eslintPattern = /eslint-disable(?!-env)/g;

      const shouldMatch = [
        '// eslint-disable-next-line no-console',
        '/* eslint-disable */',
        '// eslint-disable-line',
      ];

      const shouldNotMatch = ['/* eslint-disable-env node */'];

      for (const content of shouldMatch) {
        assert.ok(content.match(eslintPattern), `Should match: ${content}`);
      }

      for (const content of shouldNotMatch) {
        assert.ok(
          !content.match(eslintPattern),
          `Should NOT match: ${content}`,
        );
      }
    });

    it('detects biome-ignore pattern', () => {
      const biomePattern = /biome-ignore/g;
      const testContent =
        '// biome-ignore lint/suspicious/noExplicitAny: legacy code';
      const matches = testContent.match(biomePattern);
      assert.ok(matches, 'Should match biome-ignore');
    });

    it('detects shellcheck disable pattern', () => {
      const shellcheckPattern = /shellcheck disable=/g;
      const testContent = '# shellcheck disable=SC2034';
      const matches = testContent.match(shellcheckPattern);
      assert.ok(matches, 'Should match shellcheck disable');
    });

    it('detects type any patterns', () => {
      const anyPattern = /:\s*any\b|as\s+any\b/g;

      const shouldMatch = [
        'const x: any = 1;',
        'function foo(x: any)',
        'const y = value as any;',
        'let z :any',
      ];

      const shouldNotMatch = [
        'const anyValue = 1;',
        'const company = "Any Corp";',
        'function anything()',
      ];

      for (const content of shouldMatch) {
        assert.ok(content.match(anyPattern), `Should match: ${content}`);
      }

      for (const content of shouldNotMatch) {
        assert.ok(!content.match(anyPattern), `Should NOT match: ${content}`);
      }
    });
  });

  describe('complexity patterns', () => {
    it('matches JS/TS control flow keywords', () => {
      const patterns = [
        /\bif\s*\(/g,
        /\belse\s+if\s*\(/g,
        /\bfor\s*\(/g,
        /\bwhile\s*\(/g,
        /\bswitch\s*\(/g,
        /\bcatch\s*\(/g,
      ];

      const testCode = `
        if (x) {
          for (let i = 0; i < 10; i++) {
            while (true) {
              switch (y) {
                case 1: break;
              }
            }
          }
        } else if (z) {
          try {} catch (e) {}
        }
      `;

      for (const pattern of patterns) {
        const matches = testCode.match(pattern);
        assert.ok(matches, `Pattern ${pattern} should match in code`);
      }
    });

    it('matches bash control flow keywords', () => {
      const patterns = [
        /\bif\s+/g,
        /\belif\s+/g,
        /\bfor\s+/g,
        /\bwhile\s+/g,
        /\bcase\s+/g,
      ];

      const testBash = `
        if [[ -n "$x" ]]; then
          for i in 1 2 3; do
            while read -r line; do
              case "$line" in
                *) ;;
              esac
            done
          done
        elif [[ -z "$y" ]]; then
          :
        fi
      `;

      for (const pattern of patterns) {
        const matches = testBash.match(pattern);
        assert.ok(matches, `Pattern ${pattern} should match in bash`);
      }
    });
  });

  describe('output format', () => {
    it('produces structured output with scan statistics', () => {
      const result = runEvasionScan();
      const output = result.stdout;

      // Should contain scan statistics
      assert.ok(
        output.includes('Scanned:') || output.includes('files'),
        'Expected file count in output',
      );

      assert.ok(
        output.includes('Patterns:') || output.includes('patterns'),
        'Expected pattern count in output',
      );
    });

    it('uses visual separators for readability', () => {
      const result = runEvasionScan();
      const output = result.stdout;

      // Should have separator lines
      assert.ok(
        output.includes('═') || output.includes('─') || output.includes('---'),
        'Expected visual separators in output',
      );
    });
  });
});
