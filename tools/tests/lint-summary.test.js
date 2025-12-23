#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { fail, getRepoRoot } from './test-utils.js';

const repoRoot = getRepoRoot();

// Run the lint summary printing twice in a non-TTY context (stdout piped)
// Simulate CI logs where color may be enabled but cursor movement in logs
// should be avoided. Export CI=1 so the guard above treats this as non-TTY
// CI-like output.
// Construct a safe, reproducible command that references the script via an
// absolute path (using `repoRoot`) and avoid inheriting arbitrary environment
// variables from the test runner. We set `CI=1` explicitly via the `env`
// option below rather than exporting it in the shell command, and we also set a
// short timeout to avoid long-running or stuck processes.
const cmd = `bash -lc 'source "${repoRoot}/tools/scripts/gates/gate-common.sh"; lint_init || true; print_lint_summary; print_lint_summary'`;
let out = '';
try {
  const env = {
    // Minimal, explicit environment for the child process
    CI: '1',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: 'dumb',
  };
  out = execSync(cmd, { encoding: 'utf8', cwd: repoRoot, env, timeout: 30_000 });
} catch (err) {
  // Some commands may exit non-zero or time out; capture stdout/stderr for assertions
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
