#!/usr/bin/env node

// ============================================================================
// Validate-CI — E2E tests (Outstanding)
// ---------------------------------------------------------------------------
// Runs the full validate-ci script against isolated minimal workspaces to verify
// end-to-end behavior, exit codes, and key policy checks.
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

import { SAFE_PATH } from './test-utils.js';
const { detail, fatal, section } = await import(consoleHelpers);

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

function mkWorkspace(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  fs.mkdirSync(path.join(tmp, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.github', 'actions'), { recursive: true });
  return tmp;
}

const validateScript = path.join(
  repoRoot,
  'tools',
  'scripts',
  'ci',
  'validate-ci',
  'index.js',
);

function runValidateCi({ cwd, label, extraEnv = {} }) {
  section('e2e', `Running validate-ci (${label})`);
  try {
    const stdout = execFileSync(process.execPath, [validateScript], {
      cwd,
      env: {
        ...process.env,
        PATH: SAFE_PATH,
        CI: '1',
        PS_PLATFORM_ROOT: repoRoot,
        PS_VALIDATE_CI_VERIFY_REMOTE: '0',
        PS_VALIDATE_CI_QUIET: '1',
        FORCE_COLOR: '1',
        ...extraEnv,
      },
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: String(stdout), stderr: '' };
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

function assertMatches(combined, regex, label, stdout, stderr) {
  if (!regex.test(combined)) {
    fail(`Expected ${label} (${regex})`, stdout, stderr);
  }
}

section('e2e', 'validate-ci end-to-end tests');

//
// 1) FAIL CASE
//
{
  const tmp = mkWorkspace('vcie2e-fail');
  const wfdir = path.join(tmp, '.github', 'workflows');

  // Intentionally broken:
  // - no top-level permissions
  // - no job permissions
  // - first step is NOT hardened runner
  // - uses non-SHA pinned action (tag)
  writeFile(
    path.join(wfdir, 'fail.yml'),
    [
      'name: e2e-fail',
      'on: workflow_dispatch',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-22.04',
      '    steps:',
      '      - uses: actions/checkout@v1',
      '',
    ].join('\n'),
  );

  section('e2e', 'Fail workspace prepared', tmp);

  const { status, stdout, stderr } = runValidateCi({
    cwd: tmp,
    label: 'expect-fail',
  });

  const combined = `${stdout}\n${stderr}`;

  if (status === 0) {
    fail(
      'validate-ci unexpectedly succeeded (expected failure)',
      stdout,
      stderr,
    );
  }

  // Tight(er) expectations:
  assertMatches(
    combined,
    /missing top-level permissions/i,
    'missing top-level permissions',
    stdout,
    stderr,
  );
  assertMatches(
    combined,
    /job 'build' missing permissions/i,
    'missing job permissions',
    stdout,
    stderr,
  );
  assertMatches(
    combined,
    /first step must be hardened runner/i,
    'harden runner must be first',
    stdout,
    stderr,
  );
  assertMatches(
    combined,
    /action not SHA-pinned:/i,
    'action not SHA-pinned',
    stdout,
    stderr,
  );

  detail('OK: fail case produced expected policy violations');
}

//
// 2) PASS CASE
//
{
  const tmp = mkWorkspace('vcie2e-pass');
  const wfdir = path.join(tmp, '.github', 'workflows');

  // Stub local harden-runner action so local action validation passes.
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

  // Minimal local composite action.
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

  // Pass: explicit permissions, job permissions, local actions only, hardened runner first.
  writeFile(
    path.join(wfdir, 'pass.yml'),
    [
      'name: e2e-pass',
      'on: workflow_dispatch',
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

  section('e2e', 'Pass workspace prepared', tmp);

  const { status, stdout, stderr } = runValidateCi({
    cwd: tmp,
    label: 'expect-pass',
  });

  if (status !== 0) {
    fail('validate-ci unexpectedly failed (expected success)', stdout, stderr);
  }

  detail('OK: pass case succeeded');
}

section('result', 'Validate-CI E2E tests passed');
process.exit(0);
