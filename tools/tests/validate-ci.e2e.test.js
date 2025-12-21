#!/usr/bin/env node

// ============================================================================
// Validate-CI — E2E tests
// ---------------------------------------------------------------------------
// Runs the full `validate-ci` script against a minimal workspace to verify
// end-to-end behaviour, exit codes, and key policy checks.
// ============================================================================

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = (() => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(path.join(__dirname, '..', '..'));
})();
const consoleHelpers = path.join(
  repoRoot,
  'tools',
  'scripts',
  'ci',
  'validate-ci',
  'console.js',
);
const { detail, section, fatal } = await import(consoleHelpers);

function fail(msg, stdout = '', stderr = '') {
  fatal(msg);
  if (stdout) console.error('STDOUT:\n', stdout);
  if (stderr) console.error('STDERR:\n', stderr);
  process.exit(1);
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

section('e2e', 'validate-ci end-to-end tests');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcie2e-'));
const wfdir = path.join(tmp, '.github', 'workflows');
fs.mkdirSync(wfdir, { recursive: true });

// Create a minimal local composite action for the "pass" case.
writeFile(
  path.join(tmp, '.github', 'actions', 'local-ok', 'action.yml'),
  [
    'name: "Local OK"',
    'description: "Local action for validate-ci E2E pass case"',
    'runs:',
    '  using: "composite"',
    '  steps:',
    '    - shell: bash',
    '      run: echo "ok"',
    '',
  ].join('\n'),
);

// Stub the required harden-runner action so local action validation passes.
writeFile(
  path.join(tmp, '.github', 'actions', 'ps-harden-runner', 'action.yml'),
  [
    'name: "PS Harden Runner"',
    'description: "Stub harden-runner for validate-ci E2E"',
    'runs:',
    '  using: "composite"',
    '  steps:',
    '    - shell: bash',
    '      run: echo "hardened"',
    '',
  ].join('\n'),
);

// FAIL CASE: missing permissions + unpinned action ref (tag) should be blocked.
writeFile(
  path.join(wfdir, 'fail.yml'),
  [
    'name: e2e-fail',
    'on: push',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-22.04',
    '    steps:',
    '      - uses: actions/checkout@v1',
    '',
  ].join('\n'),
);

// PASS CASE: explicit permissions + local action usage (no external refs).
writeFile(
  path.join(wfdir, 'pass.yml'),
  [
    'name: e2e-pass',
    'on: push',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-22.04',
    '    permissions:',
    '      contents: read',
    '    steps:',
    '      - uses: ./.github/actions/ps-harden-runner',
    '      - uses: ./.github/actions/local-ok',
    '',
  ].join('\n'),
);

section('e2e', 'Workspace prepared', tmp);

const validateScript = path.join(
  repoRoot,
  'tools',
  'scripts',
  'ci',
  'validate-ci',
  'index.js',
);

function runValidateCi(label) {
  section('e2e', `Running validate-ci (${label})`);
  try {
    const stdout = execFileSync(process.execPath, [validateScript], {
      cwd: tmp,
      env: {
        ...process.env,
        CI: '1',
        PS_PLATFORM_ROOT: repoRoot,
        PS_VALIDATE_CI_QUIET: '1',
        FORCE_COLOR: '1',
      },
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: String(stdout), stderr: '' };
  } catch (err) {
    const stdout = String(err.stdout || '');
    const stderr = String(err.stderr || '');
    if (stdout || stderr) {
      const parts = [];
      if (String(stdout).trim()) {
        parts.push(String(stdout).trimEnd());
      }
      if (String(stderr).trim()) {
        parts.push(String(stderr).trimEnd());
      }
      const combined = parts.join('\n');
      if (combined) {
        section('e2e', `validate-ci output (${label})`);
        console.log(combined);
      }
    }
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout,
      stderr,
    };
  }
}

// 1) Fail case should fail and mention pinning/allowlist/permissions
{
  const { status, stdout, stderr } = runValidateCi('expect-fail');
  const combined = `${stdout}\n${stderr}`;

  if (status === 0) {
    fail(
      'validate-ci unexpectedly succeeded (expected failure)',
      stdout,
      stderr,
    );
  }

  // Require at least one specific “supply chain” signal AND one “permissions” signal if your tool emits them.
  const hasPinOrAllow =
    /not allowlisted/i.test(combined) ||
    /full[- ]length sha/i.test(combined) ||
    /tags and branches/i.test(combined) ||
    /pinned/i.test(combined);

  const hasPerms =
    /permissions/i.test(combined) &&
    (/must declare/i.test(combined) ||
      /explicit/i.test(combined) ||
      /missing/i.test(combined));

  if (!hasPinOrAllow) {
    fail(
      'validate-ci did not report an allowlist/SHA pinning failure as expected',
      stdout,
      stderr,
    );
  }

  // If your validate-ci enforces explicit permissions, keep this; otherwise remove.
  if (!hasPerms) {
    fail(
      'validate-ci did not report an explicit permissions failure as expected',
      stdout,
      stderr,
    );
  }

  detail('OK: fail case produced expected policy violations');
}

// 2) Pass case should succeed (local action + explicit permissions)
{
  // To avoid the fail.yml blocking the pass case, delete it before re-run.
  fs.unlinkSync(path.join(wfdir, 'fail.yml'));

  const { status, stdout, stderr } = runValidateCi('expect-pass');
  if (status !== 0) {
    fail('validate-ci unexpectedly failed (expected success)', stdout, stderr);
  }
  detail('OK: pass case succeeded');
}

section('result', 'Validate-CI E2E tests passed');
process.exit(0);
