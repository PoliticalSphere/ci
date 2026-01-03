#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Bash Syntax Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Run 'bash -n' on shell scripts to ensure no syntax errors.
// ==============================================================================

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getSafePathEnv } from '../scripts/ci/validate-ci/safe-path.js';
import { fail, getRepoRoot, section } from './test-utils.js';

const repoRoot = getRepoRoot();
const patterns = [
  path.join(repoRoot, 'tools', 'scripts'),
  path.join(repoRoot, '.github', 'actions'),
];

section(
  'shell-syntax',
  'Bash syntax checks (bash -n)',
  `Paths: ${patterns.join(', ')}`,
);

const scriptFiles = [];
for (const p of patterns) {
  if (!fs.existsSync(p)) continue;
  // Recurse directory
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && full.endsWith('.sh')) {
        scriptFiles.push(full);
      }
    }
  };
  walk(p);
}

if (scriptFiles.length === 0) {
  console.log('No scripts found for syntax checks (bootstrap).');
  process.exit(0);
}

let failed = 0;
let safePath = '';
try {
  safePath = getSafePathEnv();
} catch (err) {
  fail(`Safe PATH validation failed: ${err?.message || err}`);
}
for (const file of scriptFiles) {
  try {
    execFileSync('bash', ['-n', file], {
      encoding: 'utf8',
      env: { PATH: safePath },
    });
  } catch (err) {
    failed += 1;
    console.error(
      `SYNTAX ERROR: ${path.relative(repoRoot, file)}:\n${err.stderr || err.stdout || err.message}`,
    );
  }
}

if (failed > 0) {
  fail(`bash -n reported syntax errors in ${failed} script(s).`);
}

console.log('OK: bash -n syntax checks passed');
process.exit(0);
