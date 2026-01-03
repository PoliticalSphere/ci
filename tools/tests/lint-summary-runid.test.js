#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Lint Summary Run ID Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Test lint summary behavior with run IDs for duplicate detection.
// ==============================================================================

import { execFileSync } from 'node:child_process';
import { getSafePathEnv } from '../scripts/workflows/ci/validate-ci/safe-path.js';
import { fail, getRepoRoot } from './test-utils.js';

const repoRoot = getRepoRoot();

// Simulate two separate processes in the same GitHub Actions run by setting
// GITHUB_RUN_ID in both child processes and invoking the printing helper.
let out = '';
try {
  let safePath = '';
  try {
    safePath = getSafePathEnv();
  } catch (err) {
    fail(`Safe PATH validation failed: ${err?.message || err}`);
  }
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '1001',
    // Use only fixed, non-writable system directories to prevent PATH hijacking
    PATH: safePath,
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: 'xterm',
    PS_LINT_INLINE: '0', // force immediate printed summary in non-TTY test contexts
  };

  // Ensure no previous header files remain
  // Remove any previous per-run markers used by different versions of the helper to avoid flakes
  execFileSync(
    'bash',
    [
      '-lc',
      `rm -rf ${repoRoot}/logs/lint/.header-printed-${env.GITHUB_RUN_ID}* ${repoRoot}/logs/lint/.summary_printed_${env.GITHUB_RUN_ID}* || true`,
    ],
    { encoding: 'utf8', cwd: repoRoot, env, timeout: 30_000 },
  );

  // Run the helper twice in separate shells to simulate separate steps
  const cmd = `source "${repoRoot}/tools/scripts/gates/gate-common.sh"; lint_init || true; print_lint_summary`;
  const first = execFileSync('bash', ['-lc', cmd], {
    encoding: 'utf8',
    cwd: repoRoot,
    env,
    timeout: 30_000,
  });
  const second = execFileSync('bash', ['-lc', cmd], {
    encoding: 'utf8',
    cwd: repoRoot,
    env,
    timeout: 30_000,
  });

  out = first + second;
} catch (err) {
  out = (err.stdout || '') + (err.stderr || '');
}

const filtered = String(out)
  .split('\n')
  .filter((line) => !line.startsWith('PS.LOG '))
  .join('\n');
// Match either old header "LINT & TYPE CHECK" or new header "Linter Results"
const headerCount = (filtered.match(/LINT & TYPE CHECK|Linter Results/g) || [])
  .length;
if (headerCount !== 1) {
  fail(
    `Unexpected header count with GITHUB_RUN_ID: expected 1, found ${headerCount}\nOutput:\n${filtered}`,
  );
}

console.log(
  'OK: lint summary dedupes across processes when GITHUB_RUN_ID is set',
);
process.exit(0);
