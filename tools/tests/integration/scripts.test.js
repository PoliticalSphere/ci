#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Script Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Deterministic checks to ensure CI scripts exist and meet minimum execution
//   and safety requirements.
//
// Policy:
//   - In CI: scripts under tools/scripts must exist and meet baseline quality.
//   - Locally (bootstrap): absence of scripts is allowed with guidance.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

import {
  assertContains,
  detail,
  fail,
  getRepoRoot,
  info,
  isCI,
  section,
} from '../helpers/test-helpers.js';

// ----------------------------------------------------------------------------
// Output helpers
// ----------------------------------------------------------------------------
function isUnixLike() {
  return process.platform !== 'win32';
}

// ----------------------------------------------------------------------------

const repoRoot = getRepoRoot();
const scriptsRoot = path.join(repoRoot, 'tools', 'scripts');

section('scripts', 'Script tests starting', `Root: ${scriptsRoot}`);

if (!fs.existsSync(scriptsRoot) || !fs.statSync(scriptsRoot).isDirectory()) {
  if (isCI()) {
    fail('tools/scripts not found (CI requires tools/scripts)');
  }
  info('OK (bootstrap): tools/scripts not found yet.');
  info('HINT: add scripts under tools/scripts/*.sh');
  process.exit(0);
}

const scripts = [];

function collect(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      scripts.push(full);
    }
  }
}

collect(scriptsRoot);

if (scripts.length === 0) {
  if (isCI()) {
    fail('no shell scripts found under tools/scripts (CI requires scripts)');
  }
  info('OK (bootstrap): no shell scripts found yet.');
  info('HINT: add scripts under tools/scripts/*.sh');
  process.exit(0);
}

scripts.sort();
let checked = 0;

section('script', 'Checking scripts', `${scripts.length} script(s)`);

for (const file of scripts) {
  const rel = path.relative(repoRoot, file);
  const raw = fs.readFileSync(file, 'utf8');

  // Baseline: no CRLF (helps avoid "bad interpreter" issues)
  if (raw.includes('\r\n')) {
    fail(`${rel}: contains CRLF line endings. Use LF only.`);
  }

  // Baseline: shebang
  const firstLine = raw.split('\n')[0] || '';
  const hasShebang =
    firstLine.startsWith('#!/usr/bin/env bash') ||
    firstLine.startsWith('#!/bin/bash');

  if (!hasShebang) {
    fail(
      `${rel}: missing bash shebang.\n` +
        `HINT: start the file with '#!/usr/bin/env bash' and ensure it runs under bash.`,
    );
  }

  // Baseline: strict mode (we require the exact string somewhere near the top)
  // You can tighten this to "within first N lines" if you want.
  assertContains(
    raw,
    'set -euo pipefail',
    rel,
    "Add 'set -euo pipefail' near the top of the script for deterministic failures.",
  );

  // Optional: executable bit check on Unix-like systems
  if (isUnixLike()) {
    const stat = fs.statSync(file);
    if ((stat.mode & 0o111) === 0) {
      fail(`${rel}: script is not executable (chmod +x ${rel})`);
    }
  }

  checked += 1;
  detail(`${rel}: ok`);
}

section('result', 'Script tests passed', `${checked} script(s) validated`);
info(`OK: ${checked} script(s) are present and meet baseline requirements`);
process.exit(0);
