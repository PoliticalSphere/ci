#!/usr/bin/env node

// ============================================================================
// Validate-CI — Unit tests
// ---------------------------------------------------------------------------
// Deterministic checks for `scanWorkflows` and `scanActions` behavior.
//
// Goals:
//   - No network calls (remote verifier stubbed)
//   - Real YAML files written to a temp workspace (exercise parser + checks)
//   - Assert key violations *and* some metadata (path/weight/line)
//   - Avoid brittleness by controlling baselines + allowed-first-steps
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

import {
  scanActions,
  scanWorkflows,
} from '../scripts/ci/validate-ci/checks.js';
import { fail, info, mktemp, section } from './test-utils.js';

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertSome(messages, regex, label) {
  if (!messages.some((m) => regex.test(m))) {
    fail(`expected ${label} violation (${regex})`);
  }
}

function findViolation(violations, regex) {
  return violations.find((v) => regex.test(String(v.message)));
}

function assertViolationMeta(v, { relPath, minWeight }) {
  assert(v, 'expected violation to exist');
  if (relPath) {
    assert(
      String(v.path).replaceAll('\\', '/') === relPath,
      `expected violation path '${relPath}', got '${v.path}'`,
    );
  }
  if (typeof minWeight === 'number') {
    assert(
      typeof v.weight === 'number' && v.weight >= minWeight,
      `expected violation weight >= ${minWeight}, got '${v.weight}'`,
    );
  }
  assert(
    typeof v.line === 'number' && v.line >= 1,
    `expected line>=1, got '${v.line}'`,
  );
}

const alwaysOkVerifier = async () => ({ ok: true, error: null });

try {
  // ----------------------------------------------------------------------------
  // Setup temp workspace
  // ----------------------------------------------------------------------------
  const tmp = mktemp();
  const workflowsDir = path.join(tmp, '.github', 'workflows');
  const actionsDir = path.join(tmp, '.github', 'actions');
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.mkdirSync(actionsDir, { recursive: true });

  // ----------------------------------------------------------------------------
  // Unit test: scanWorkflows should report common violations
  // ----------------------------------------------------------------------------
  section('unit', 'scanWorkflows: common violations');

  const wfPath = path.join(workflowsDir, 'bad-workflow.yml');
  const relWfPath = '.github/workflows/bad-workflow.yml';

  // Violations intentionally included:
  // - missing top-level permissions
  // - missing job permissions
  // - unallowlisted action + non-SHA pin (actions/checkout@v1)
  // - docker action without digest
  // - secrets interpolated in run
  // - secrets interpolated in with:
  //
  // Note: We explicitly disable harden-runner-first failures by setting allowedFirstSteps
  // to allow actions/checkout@ as a bootstrap (checkout then harden). This keeps this
  // test focused on the listed violations.
  const wf = [
    'name: CI test',
    'on: workflow_dispatch',
    'jobs:',
    '  test_job:',
    '    runs-on: ubuntu-22.04',
    '    steps:',
    '      - name: Checkout',
    '        uses: actions/checkout@v1',
    '      - name: Docker step',
    '        uses: docker://alpine',
    '      - name: With secret',
    '        uses: actions/cache@v3',
    '        with:',
    '          path: node_modules',
    '          key: $' + '{{ secrets.TOKEN }}',
    '      - name: Dump secret',
    '        run: echo $' + '{{ secrets.TOKEN }}',
    '',
  ].join('\n');

  fs.writeFileSync(wfPath, wf, 'utf8');

  const violations = await scanWorkflows({
    workflows: [wfPath],
    workspaceRoot: tmp,

    // Supply-chain policy: nothing allowlisted
    allowedActions: new Set([]),

    unsafePatterns: [],
    unsafeAllowlist: [],

    inlineAllowlist: [],
    inlineConstraints: { forbidRegex: [], requireContains: [] },
    inlineMaxLines: 10,

    // High risk triggers: not under test
    highRisk: { triggers: new Set(), allowlist: new Map() },

    // Baseline config: keep minimal but deterministic
    permissionsBaseline: {
      defaults: { unspecified: 'none' },
      workflows: {},
    },

    // Artifacts: not under test
    artifactPolicy: { allowlist: new Map(), requiredPaths: [] },

    validateRemoteAction: alwaysOkVerifier,
    requireSectionHeaders: false,

    // Prevent this test from failing due to harden-runner-first rule:
    // allow checkout then harden bootstrap pattern OR allow harden itself.
    allowedFirstSteps: ['actions/checkout@', 'step-security/harden-runner@'],

    quiet: true,
  });

  info(`Found ${violations.length} violation(s)`);

  const msgs = violations.map((v) => v.message);

  // Core expectations
  assertSome(
    msgs,
    /missing top-level permissions/i,
    'missing top-level permissions',
  );
  assertSome(
    msgs,
    /job 'test_job' missing permissions/i,
    'missing job permissions',
  );
  assertSome(msgs, /action not allowlisted:/i, 'action not allowlisted');
  assertSome(msgs, /action not SHA-pinned:/i, 'action not SHA-pinned');
  assertSome(msgs, /docker action not pinned by digest:/i, 'docker not pinned');
  assertSome(msgs, /secrets interpolated in run/i, 'secrets-in-run');
  assertSome(msgs, /secrets interpolated in 'with'/i, 'secrets-in-with');

  // A couple of metadata assertions (path + weight) to prevent regressions
  const vAllowlisted = findViolation(violations, /action not allowlisted:/i);
  assertViolationMeta(vAllowlisted, { relPath: relWfPath, minWeight: 1 });

  const vShaPinned = findViolation(violations, /action not SHA-pinned:/i);
  assertViolationMeta(vShaPinned, { relPath: relWfPath, minWeight: 1 });

  info('OK: scanWorkflows unit checks passed');

  // ----------------------------------------------------------------------------
  // Unit test: scanActions should report un-allowlisted and non-SHA pinned actions
  // ----------------------------------------------------------------------------
  section('unit', 'scanActions: composite action checks');

  const dummyDir = path.join(actionsDir, 'dummy');
  fs.mkdirSync(dummyDir, { recursive: true });

  const actionYml = path.join(dummyDir, 'action.yml');
  const relActionYml = '.github/actions/dummy/action.yml';

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
    quiet: true,
  });

  const amsgs = actionViolations.map((v) => v.message);

  assertSome(
    amsgs,
    /action not allowlisted:/i,
    'action not allowlisted in action file',
  );
  assertSome(
    amsgs,
    /action not SHA-pinned:/i,
    'action not SHA-pinned in action file',
  );
  assertSome(
    amsgs,
    /docker action not pinned by digest:/i,
    'docker not pinned in action file',
  );

  // Metadata check
  const av = findViolation(actionViolations, /action not SHA-pinned:/i);
  assertViolationMeta(av, { relPath: relActionYml, minWeight: 1 });

  info('OK: scanActions unit checks passed');

  section('result', 'Validate-CI unit tests passed');
  process.exit(0);
} catch (err) {
  fail(err?.stack || err?.message || String(err));
}
