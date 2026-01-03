#!/usr/bin/env node

// ============================================================================
// Political Sphere — License Check Tests
// ---------------------------------------------------------------------------
// Purpose:
//   Unit tests for tools/scripts/security/license-check.js functions.
// ============================================================================

import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

const REPO_ROOT = process.cwd();
const LICENSE_CHECK = path.join(
  REPO_ROOT,
  'tools/scripts/security/license-check.js',
);
const TEST_WORKSPACE = path.join(REPO_ROOT, 'logs/test-license-check');

/**
 * Create a minimal test environment with policy and lockfile.
 */
function setupTestEnv({ policy = null, lockfile = null } = {}) {
  if (!existsSync(TEST_WORKSPACE)) {
    mkdirSync(TEST_WORKSPACE, { recursive: true });
  }

  // Create configs directory
  const configDir = path.join(TEST_WORKSPACE, 'configs/security');
  mkdirSync(configDir, { recursive: true });

  // Create reports directory
  const reportsDir = path.join(TEST_WORKSPACE, 'reports/security');
  mkdirSync(reportsDir, { recursive: true });

  // Write policy file
  const policyPath = path.join(configDir, 'license-policy.yml');
  const defaultPolicy = `
policy:
  mode: allowlist
  allowlist:
    - MIT
    - Apache-2.0
    - ISC
    - BSD-2-Clause
    - BSD-3-Clause
  denylist:
    - GPL-3.0
    - AGPL-3.0
  fail_on_unknown: true
  fail_on_unlicensed: true
`;
  writeFileSync(policyPath, policy || defaultPolicy);

  // Write lockfile
  const lockPath = path.join(TEST_WORKSPACE, 'package-lock.json');
  const defaultLock = {
    name: 'test-project',
    lockfileVersion: 3,
    packages: {
      '': { name: 'test-project', version: '1.0.0' },
      'node_modules/allowed-pkg': {
        name: 'allowed-pkg',
        version: '1.0.0',
        license: 'MIT',
      },
    },
  };
  writeFileSync(lockPath, JSON.stringify(lockfile || defaultLock, null, 2));

  return { policyPath, lockPath };
}

/**
 * Run license-check.js with custom environment.
 * @param {object} options - Options
 * @returns {{ stdout: string, stderr: string, status: number, report: object | null }}
 */
function runLicenseCheck(options = {}) {
  const { policy, lockfile, extraArgs = '' } = options;

  setupTestEnv({ policy, lockfile });

  const reportPath = path.join(
    TEST_WORKSPACE,
    'reports/security/license-report.json',
  );

  try {
    // Use array form of execSync to prevent shell injection attacks
    // This safely passes each argument without shell interpretation
    const stdout = execSync('node', [LICENSE_CHECK, ...extraArgs], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PS_LICENSE_REPO_ROOT: TEST_WORKSPACE,
        PS_LICENSE_POLICY: 'configs/security/license-policy.yml',
        PS_LICENSE_LOCK_PATH: 'package-lock.json',
        PS_LICENSE_REPORT: 'reports/security/license-report.json',
        PS_LICENSE_SUMMARY: 'reports/security/license-summary.txt',
      },
      cwd: REPO_ROOT,
      timeout: 10000,
    });

    let report = null;
    if (existsSync(reportPath)) {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
    }

    return { stdout: stdout.trim(), stderr: '', status: 0, report };
  } catch (error) {
    let report = null;
    if (existsSync(reportPath)) {
      try {
        report = JSON.parse(readFileSync(reportPath, 'utf8'));
      } catch {
        /* ignore */
      }
    }
    return {
      stdout: error.stdout?.trim() ?? '',
      stderr: error.stderr?.trim() ?? '',
      status: error.status ?? 1,
      report,
    };
  }
}

describe('license-check.js', () => {
  beforeEach(() => {
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true });
    }
    mkdirSync(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  describe('allowlist mode', () => {
    it('passes when all packages have allowlisted licenses', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/pkg-a': {
              name: 'pkg-a',
              version: '1.0.0',
              license: 'MIT',
            },
            'node_modules/pkg-b': {
              name: 'pkg-b',
              version: '2.0.0',
              license: 'Apache-2.0',
            },
          },
        },
      });

      assert.equal(result.status, 0, `Expected success, got: ${result.stderr}`);
      assert.ok(result.report, 'Report should be generated');
      assert.equal(result.report.summary.violations, 0);
      assert.equal(result.report.summary.allowed, 2);
    });

    it('fails when package has denied license', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/gpl-pkg': {
              name: 'gpl-pkg',
              version: '1.0.0',
              license: 'GPL-3.0',
            },
          },
        },
      });

      assert.equal(result.status, 1, 'Should fail with denied license');
      assert.ok(result.report, 'Report should be generated');
      assert.equal(result.report.summary.violations, 1);
      assert.equal(result.report.violations[0].name, 'gpl-pkg');
      assert.equal(result.report.violations[0].reason, 'denied-license');
    });

    it('fails when package has unlisted license', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/weird-pkg': {
              name: 'weird-pkg',
              version: '1.0.0',
              license: 'WTFPL',
            },
          },
        },
      });

      assert.equal(result.status, 1, 'Should fail with unknown license');
      assert.ok(result.report, 'Report should be generated');
      assert.equal(result.report.summary.violations, 1);
      assert.equal(result.report.violations[0].reason, 'not-allowlisted');
    });

    it('handles SPDX expressions with OR', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/dual-pkg': {
              name: 'dual-pkg',
              version: '1.0.0',
              license: 'MIT OR Apache-2.0',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Expected success with OR expression, got: ${result.stderr}`,
      );
      assert.equal(result.report.summary.violations, 0);
    });

    it('handles SPDX expressions with AND', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/combo-pkg': {
              name: 'combo-pkg',
              version: '1.0.0',
              license: 'MIT AND BSD-3-Clause',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Expected success with AND expression, got: ${result.stderr}`,
      );
      assert.equal(result.report.summary.violations, 0);
    });
  });

  describe('denylist mode', () => {
    const denylistPolicy = `
policy:
  mode: denylist
  denylist:
    - GPL-3.0
    - AGPL-3.0
  fail_on_unknown: false
  fail_on_unlicensed: false
`;

    it('allows any license not in denylist', () => {
      const result = runLicenseCheck({
        policy: denylistPolicy,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/any-pkg': {
              name: 'any-pkg',
              version: '1.0.0',
              license: 'WTFPL',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Should pass in denylist mode: ${result.stderr}`,
      );
      assert.equal(result.report.summary.violations, 0);
    });

    it('fails when package has denied license', () => {
      const result = runLicenseCheck({
        policy: denylistPolicy,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/gpl-pkg': {
              name: 'gpl-pkg',
              version: '1.0.0',
              license: 'GPL-3.0',
            },
          },
        },
      });

      assert.equal(result.status, 1, 'Should fail with denied license');
      assert.equal(result.report.summary.violations, 1);
    });
  });

  describe('unlicensed packages', () => {
    it('fails on missing license when fail_on_unlicensed is true', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/no-license': {
              name: 'no-license',
              version: '1.0.0',
            },
          },
        },
      });

      assert.equal(result.status, 1, 'Should fail with missing license');
      assert.equal(result.report.summary.violations, 1);
      assert.equal(result.report.violations[0].reason, 'missing-license');
    });

    it('ignores missing license when fail_on_unlicensed is false', () => {
      const lenientPolicy = `
policy:
  mode: allowlist
  allowlist:
    - MIT
  fail_on_unlicensed: false
  fail_on_unknown: false
`;
      const result = runLicenseCheck({
        policy: lenientPolicy,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/no-license': {
              name: 'no-license',
              version: '1.0.0',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Should pass when unlicensed allowed: ${result.stderr}`,
      );
      assert.equal(result.report.summary.violations, 0);
      assert.equal(result.report.summary.unknown, 1);
    });
  });

  describe('ignore_packages', () => {
    it('ignores specified packages', () => {
      const policyWithIgnore = `
policy:
  mode: allowlist
  allowlist:
    - MIT
  fail_on_unknown: true
  ignore_packages:
    - weird-internal-pkg
`;
      const result = runLicenseCheck({
        policy: policyWithIgnore,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/weird-internal-pkg': {
              name: 'weird-internal-pkg',
              version: '1.0.0',
              license: 'Proprietary',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Should pass when package is ignored: ${result.stderr}`,
      );
      assert.equal(
        result.report.summary.total,
        0,
        'Ignored packages should not be counted',
      );
    });
  });

  describe('regex patterns', () => {
    const regexPolicy = `
policy:
  mode: allowlist
  allowlist: []
  allowlist_regex:
    - "^BSD-.*"
    - "^Apache-.*"
  denylist_regex:
    - "^GPL-.*"
  fail_on_unknown: true
`;

    it('matches allowlist regex patterns', () => {
      const result = runLicenseCheck({
        policy: regexPolicy,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/bsd-pkg': {
              name: 'bsd-pkg',
              version: '1.0.0',
              license: 'BSD-4-Clause',
            },
          },
        },
      });

      assert.equal(result.status, 0, `Should match regex: ${result.stderr}`);
      assert.equal(result.report.summary.violations, 0);
    });

    it('matches denylist regex patterns', () => {
      const result = runLicenseCheck({
        policy: regexPolicy,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/gpl-v2-pkg': {
              name: 'gpl-v2-pkg',
              version: '1.0.0',
              license: 'GPL-2.0',
            },
          },
        },
      });

      assert.equal(result.status, 1, 'Should match deny regex');
      assert.equal(result.report.violations[0].reason, 'denied-license');
    });
  });

  describe('package exceptions', () => {
    const exceptionPolicy = `
policy:
  mode: allowlist
  allowlist:
    - MIT
  fail_on_unknown: true
  exceptions:
    packages:
      - name: special-pkg
        allowlist:
          - Proprietary-Special
`;

    it('allows exception for specific package', () => {
      const result = runLicenseCheck({
        policy: exceptionPolicy,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/special-pkg': {
              name: 'special-pkg',
              version: '1.0.0',
              license: 'Proprietary-Special',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Exception should allow license: ${result.stderr}`,
      );
      assert.equal(result.report.summary.violations, 0);
    });
  });

  describe('SPDX WITH expressions', () => {
    it('handles license WITH exception', () => {
      const result = runLicenseCheck({
        policy: `
policy:
  mode: allowlist
  allowlist:
    - "Apache-2.0 WITH LLVM-exception"
  fail_on_unknown: true
`,
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/llvm-pkg': {
              name: 'llvm-pkg',
              version: '1.0.0',
              license: 'Apache-2.0 WITH LLVM-exception',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Should handle WITH expression: ${result.stderr}`,
      );
    });
  });

  describe('scoped packages', () => {
    it('correctly identifies scoped package names', () => {
      const result = runLicenseCheck({
        lockfile: {
          name: 'test',
          lockfileVersion: 3,
          packages: {
            '': { name: 'test', version: '1.0.0' },
            'node_modules/@org/scoped-pkg': {
              name: '@org/scoped-pkg',
              version: '1.0.0',
              license: 'MIT',
            },
          },
        },
      });

      assert.equal(
        result.status,
        0,
        `Should handle scoped packages: ${result.stderr}`,
      );
      assert.equal(result.report.summary.allowed, 1);
    });
  });

  describe('error handling', () => {
    it('fails gracefully when policy file is missing', () => {
      // Setup test env, then delete the policy file
      setupTestEnv({});
      const policyPath = path.join(
        TEST_WORKSPACE,
        'configs/security/license-policy.yml',
      );
      rmSync(policyPath);

      try {
        // Use array form to prevent shell injection attacks
        execSync('node', [LICENSE_CHECK], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PS_LICENSE_REPO_ROOT: TEST_WORKSPACE,
          },
          cwd: REPO_ROOT,
          timeout: 10000,
        });
        assert.fail('Should have thrown');
      } catch (error) {
        assert.equal(error.status, 1, 'Should exit with error');
        assert.ok(
          error.stderr?.includes('policy') || error.stdout?.includes('policy'),
          'Error should mention policy',
        );
      }
    });

    it('fails gracefully when lockfile is missing', () => {
      // Setup but then remove lockfile
      setupTestEnv({});
      const lockPath = path.join(TEST_WORKSPACE, 'package-lock.json');
      rmSync(lockPath);

      try {
        // Use array form to prevent shell injection attacks
        execSync('node', [LICENSE_CHECK], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PS_LICENSE_REPO_ROOT: TEST_WORKSPACE,
          },
          cwd: REPO_ROOT,
          timeout: 10000,
        });
        assert.fail('Should have thrown');
      } catch (error) {
        assert.equal(error.status, 1, 'Should exit with error');
        assert.ok(
          error.stderr?.includes('lockfile') ||
            error.stdout?.includes('lockfile'),
          'Error should mention lockfile',
        );
      }
    });
  });

  describe('v2 lockfile format', () => {
    it('handles npm v2 lockfile with dependencies', () => {
      const v2Lockfile = {
        name: 'test',
        lockfileVersion: 2,
        dependencies: {
          'dep-a': {
            version: '1.0.0',
            license: 'MIT',
            dependencies: {
              'nested-dep': {
                version: '0.1.0',
                license: 'ISC',
              },
            },
          },
        },
      };

      const result = runLicenseCheck({ lockfile: v2Lockfile });

      assert.equal(
        result.status,
        0,
        `Should handle v2 lockfile: ${result.stderr}`,
      );
      assert.equal(
        result.report.summary.allowed,
        2,
        'Should find nested dependencies',
      );
    });
  });
});
