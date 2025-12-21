#!/usr/bin/env node

// ============================================================================
// Validate-CI — Unit tests
// ---------------------------------------------------------------------------
// Deterministic checks for `scanWorkflows` and `scanActions` behaviour.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

import {
  scanActions,
  scanWorkflows,
} from '../scripts/ci/validate-ci/checks.js';
import { fail, info, mktemp, section } from './test-utils.js';

// ----------------------------------------------------------------------------
// Unit test: scanWorkflows should report common violations
// ----------------------------------------------------------------------------
section('unit', 'scanWorkflows: common violations');

const tmp = mktemp();
const workflowsDir = path.join(tmp, '.github', 'workflows');
fs.mkdirSync(workflowsDir, { recursive: true });

const wfPath = path.join(workflowsDir, 'bad-workflow.yml');

// Valid workflow shape (runs-on present), but includes policy violations:
// - missing job permissions
// - unallowlisted action
// - non-SHA pinned action (@v1)
// - secrets interpolation in run
const wf = [
  'name: CI test',
  'on: push',
  'jobs:',
  '  test_job:',
  '    runs-on: ubuntu-22.04',
  '    steps:',
  '      - name: Checkout',
  '        uses: actions/checkout@v1',
  '      - name: Docker step',
  '        uses: docker://alpine',
  '      - name: Dump secret',
  '        run: echo $' + '{{ secrets.TOKEN }}',
  '',
].join('\n');

fs.writeFileSync(wfPath, wf, 'utf8');

const alwaysOkVerifier = async () => ({ ok: true, error: null });

const violations = await scanWorkflows({
  workflows: [wfPath],
  workspaceRoot: tmp,

  // Supply-chain policy: nothing allowlisted
  allowedActions: new Set([]),

  // Unsafe patterns list (empty here; secrets-in-run is asserted via your existing rule strings)
  unsafePatterns: [],
  unsafeAllowlist: [],

  // Inline shell allowlist (empty)
  inlineAllowlist: [],
  inlineConstraints: { forbidRegex: [], requireContains: [] },
  inlineMaxLines: 10,

  // High risk triggers: none
  highRisk: { triggers: new Set(), allowlist: new Map() },

  // Permissions baseline: requires explicit permissions, but baseline empty means
  // "job missing permissions" should still be caught (per your implementation).
  permissionsBaseline: { defaults: { unspecified: 'none' }, workflows: {} },

  // Artifacts: not under test here
  artifactPolicy: { allowlist: new Map(), requiredPaths: [] },

  validateRemoteAction: alwaysOkVerifier,
  requireSectionHeaders: false,
});

info(`Found ${violations.length} violation(s)`);

const msgs = violations.map((v) => v.message);

function expect(regex, label) {
  if (!msgs.some((m) => regex.test(m))) {
    fail(`expected ${label} violation (${regex})`);
  }
}

expect(/missing permissions/i, 'missing job permissions');
expect(/not allowlisted/i, 'action not allowlisted');
expect(/not.*sha[- ]pinned|sha[- ]pinned.*required/i, 'action not SHA-pinned');
expect(/docker action not pinned by digest/i, 'docker not pinned');
expect(/secrets.*(interpolated|in run)/i, 'secrets-in-run');

info('OK: scanWorkflows unit checks passed');

// ----------------------------------------------------------------------------
// Unit test: scanActions should report un-allowlisted and non-SHA pinned actions
// ----------------------------------------------------------------------------
section('unit', 'scanActions: action file checks');

const actionDir = path.join(tmp, '.github', 'actions', 'dummy');
fs.mkdirSync(actionDir, { recursive: true });
const actionYml = path.join(actionDir, 'action.yml');

fs.writeFileSync(
  actionYml,
  [
    'name: dummy',
    'description: dummy action',
    'runs:',
    '  using: composite',
    '  steps:',
    '    - uses: actions/checkout@v1',
    '    - uses: docker://alpine',
    '',
  ].join('\n'),
  'utf8',
);

const actionViolations = await scanActions({
  actions: [actionYml],
  platformRoot: tmp,
  allowedActions: new Set([]),
  validateRemoteAction: alwaysOkVerifier,
});

const amsgs = actionViolations.map((v) => v.message);

function aexpect(regex, label) {
  if (!amsgs.some((m) => regex.test(m))) {
    fail(`expected ${label} violation (${regex})`);
  }
}

aexpect(/not allowlisted/i, 'action not allowlisted in action file');
aexpect(
  /not.*sha[- ]pinned|sha[- ]pinned.*required/i,
  'action not SHA-pinned in action file',
);
aexpect(
  /docker action not pinned by digest/i,
  'docker not pinned in action file',
);

info('OK: scanActions unit checks passed');

section('result', 'Validate-CI unit tests passed');
process.exit(0);
