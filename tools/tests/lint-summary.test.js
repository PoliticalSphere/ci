#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { fail, getRepoRoot } from './test-utils.js';

const repoRoot = getRepoRoot();

// Run the lint summary printing twice in a non-TTY context (stdout piped)
// Simulate CI logs where color may be enabled but cursor movement in logs
// should be avoided. Export CI=1 so the guard above treats this as non-TTY
// CI-like output.
const cmd = `bash -lc 'export CI=1; source tools/scripts/gates/gate-common.sh; lint_init || true; print_lint_summary; print_lint_summary'`;
let out = '';
try {
  out = execSync(cmd, { encoding: 'utf8', cwd: repoRoot });
} catch (err) {
  // Some commands may exit non-zero; capture stdout/stderr for assertions anyway
  out = (err.stdout || '') + (err.stderr || '');
}

// Ensure header string appears exactly once (avoid duplicate banners)
const headerCount = (out.match(/LINT & TYPE CHECK/g) || []).length;
if (headerCount !== 1) {
  fail(`Unexpected header count: expected 1, found ${headerCount}\nOutput:\n${out}`);
}

// Ensure the BIOME row occurs exactly once (not duplicated)
const biomeCount = (out.match(/BIOME/g) || []).length;
if (biomeCount !== 1) {
  fail(`Unexpected BIOME row count: expected 1, found ${biomeCount}\nOutput:\n${out}`);
}

console.log('OK: lint summary prints only once in non-TTY mode');
process.exit(0);
