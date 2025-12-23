#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
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
let out = '';
try {
  const env = {
    // Minimal, explicit environment for the child process
    CI: '1',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: 'dumb',
  };

  // Safer: execute the bash binary directly with execFileSync so we avoid
  // spawning an intermediate shell via the node exec helpers. We still run
  // a controlled shell command string (needed to `source` the gate script),
  // but passing it as an argument to the bash binary via execFileSync
  // prevents accidental injection from untrusted input and avoids going
  // through a shell interpreter provided by exec()/execSync.
  const commandString = `source "${repoRoot}/tools/scripts/gates/gate-common.sh"; lint_init || true; print_lint_summary; print_lint_summary`;
  out = execFileSync('bash', ['-lc', commandString], {
    encoding: 'utf8',
    cwd: repoRoot,
    env,
    timeout: 30_000,
  });
} catch (err) {
  // Some commands may exit non-zero or time out; capture stdout/stderr for assertions
  out = (err.stdout || '') + (err.stderr || '');
}

// Ensure header string appears exactly once (avoid duplicate banners)
const headerCount = (out.match(/LINT & TYPE CHECK/g) || []).length;
if (headerCount !== 1) {
  fail(
    `Unexpected header count: expected 1, found ${headerCount}\nOutput:\n${out}`,
  );
}

// Ensure the BIOME row occurs exactly once (not duplicated)
const biomeCount = (out.match(/BIOME/g) || []).length;
if (biomeCount !== 1) {
  fail(
    `Unexpected BIOME row count: expected 1, found ${biomeCount}\nOutput:\n${out}`,
  );
}

console.log('OK: lint summary prints only once in non-TTY mode');
process.exit(0);
