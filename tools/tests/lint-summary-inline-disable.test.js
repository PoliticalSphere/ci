#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fail, getRepoRoot } from './test-utils.js';

const repoRoot = getRepoRoot();

// Run the lint summary printing twice but with PS_LINT_INLINE=0 to ensure
// the summary does not duplicate even when an environment might otherwise
// allow in-place updates.
const commandString = `source "${repoRoot}/tools/scripts/gates/gate-common.sh"; lint_init || true; print_lint_summary; print_lint_summary`;
let out = '';
try {
  const env = {
    // Disable in-place updates explicitly
    PS_LINT_INLINE: '0',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: 'xterm',
  };
  out = execFileSync('bash', ['-lc', commandString], { encoding: 'utf8', cwd: repoRoot, env, timeout: 30_000 });
} catch (err) {
  out = (err.stdout || '') + (err.stderr || '');
}

const headerCount = (out.match(/LINT & TYPE CHECK/g) || []).length;
if (headerCount !== 1) {
  fail(`Unexpected header count: expected 1, found ${headerCount}\nOutput:\n${out}`);
}

const biomeCount = (out.match(/BIOME/g) || []).length;
if (biomeCount !== 1) {
  fail(`Unexpected BIOME row count: expected 1, found ${biomeCount}\nOutput:\n${out}`);
}

console.log('OK: lint summary prints only once when PS_LINT_INLINE=0');
process.exit(0);
