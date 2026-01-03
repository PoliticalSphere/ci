#!/usr/bin/env node

// ============================================================================
// Political Sphere — Egress Allowlist Tests
// ---------------------------------------------------------------------------
// Purpose:
//   Unit tests for tools/scripts/egress.sh functions: URL host extraction,
//   allowlist loading, and host validation.
// ============================================================================

import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

const REPO_ROOT = process.cwd();
const EGRESS_SCRIPT = path.join(REPO_ROOT, 'tools/scripts/egress.sh');
const TEST_WORKSPACE = path.join(REPO_ROOT, 'logs/test-egress');

/**
 * Helper to run a bash snippet that sources egress.sh and executes test code.
 * @param {string} testCode - Bash code to execute after sourcing egress.sh
 * @param {object} options - Options
 * @param {string} [options.allowlistContent] - Custom allowlist YAML content
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runEgressTest(testCode, options = {}) {
  const { allowlistContent } = options;

  // Ensure test workspace exists
  if (!existsSync(TEST_WORKSPACE)) {
    mkdirSync(TEST_WORKSPACE, { recursive: true });
  }

  // Write custom allowlist if provided
  const _allowlistPath = path.join(TEST_WORKSPACE, 'egress-allowlist.yml');
  if (allowlistContent) {
    const policyDir = path.join(TEST_WORKSPACE, 'configs/ci/policies');
    mkdirSync(policyDir, { recursive: true });
    writeFileSync(
      path.join(policyDir, 'egress-allowlist.yml'),
      allowlistContent,
    );
  }

  const script = `
set -euo pipefail
source "${EGRESS_SCRIPT}"
${allowlistContent ? `export PS_EGRESS_ALLOWLIST_FILE="${path.join(TEST_WORKSPACE, 'configs/ci/policies/egress-allowlist.yml')}"` : ''}
${testCode}
`;

  try {
    const stdout = execSync(`bash -c '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf8',
      env: { ...process.env, REPO_ROOT },
      cwd: REPO_ROOT,
    });
    return { stdout: stdout.trim(), stderr: '', status: 0 };
  } catch (error) {
    return {
      stdout: error.stdout?.trim() ?? '',
      stderr: error.stderr?.trim() ?? '',
      status: error.status ?? 1,
    };
  }
}

describe('egress.sh', () => {
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

  describe('_egress_host_from_url', () => {
    it('extracts host from https URL', () => {
      const result = runEgressTest(`
        host=$(_egress_host_from_url "https://api.github.com/repos/owner/repo")
        printf '%s' "$host"
      `);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'api.github.com');
    });

    it('extracts host from http URL', () => {
      const result = runEgressTest(`
        host=$(_egress_host_from_url "http://example.com/path/to/resource")
        printf '%s' "$host"
      `);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'example.com');
    });

    it('extracts host from URL with port', () => {
      const result = runEgressTest(`
        host=$(_egress_host_from_url "https://localhost:8080/api")
        printf '%s' "$host"
      `);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'localhost');
    });

    it('extracts host from git SSH URL', () => {
      const result = runEgressTest(`
        host=$(_egress_host_from_url "git@github.com:owner/repo.git")
        printf '%s' "$host"
      `);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'github.com');
    });

    it('extracts host from plain hostname', () => {
      const result = runEgressTest(`
        host=$(_egress_host_from_url "example.com")
        printf '%s' "$host"
      `);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'example.com');
    });

    it('extracts host from hostname with path', () => {
      const result = runEgressTest(`
        host=$(_egress_host_from_url "example.com/some/path")
        printf '%s' "$host"
      `);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'example.com');
    });
  });

  describe('load_egress_allowlist', () => {
    it('loads allowlist from default location', () => {
      const result = runEgressTest(`
        load_egress_allowlist
        printf '%s' "\${#EGRESS_ALLOWLIST[@]}"
      `);
      assert.equal(result.status, 0);
      // Should have loaded some entries
      const count = parseInt(result.stdout, 10);
      assert.ok(count > 0, `Expected entries in allowlist, got ${count}`);
    });

    it('loads allowlist from custom file', () => {
      const allowlist = `
allowlist:
  - test1.example.com
  - test2.example.com
  - test3.example.com
`;
      const result = runEgressTest(
        `
        load_egress_allowlist
        printf '%s' "\${#EGRESS_ALLOWLIST[@]}"
      `,
        { allowlistContent: allowlist },
      );
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '3');
    });

    it('fails on missing allowlist file', () => {
      const result = runEgressTest(`
        export PS_EGRESS_ALLOWLIST_FILE="/nonexistent/path.yml"
        load_egress_allowlist
      `);
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('not found'));
    });

    it('fails on empty allowlist', () => {
      const allowlist = `
allowlist:
`;
      const result = runEgressTest(
        `
        load_egress_allowlist
      `,
        { allowlistContent: allowlist },
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('empty'));
    });

    it('ignores comments in allowlist', () => {
      const allowlist = `
# This is a comment
allowlist:
  # Another comment
  - valid.example.com  # inline comment
`;
      const result = runEgressTest(
        `
        load_egress_allowlist
        printf '%s' "\${EGRESS_ALLOWLIST[0]}"
      `,
        { allowlistContent: allowlist },
      );
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'valid.example.com');
    });
  });

  describe('assert_egress_allowed_host', () => {
    const testAllowlist = `
allowlist:
  - api.github.com
  - github.com
  - pypi.org
`;

    it('allows host in allowlist', () => {
      const result = runEgressTest(
        `
        load_egress_allowlist
        assert_egress_allowed_host "api.github.com"
        printf 'OK'
      `,
        { allowlistContent: testAllowlist },
      );
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'OK');
    });

    it('rejects host not in allowlist', () => {
      const result = runEgressTest(
        `
        load_egress_allowlist
        assert_egress_allowed_host "malicious.example.com"
      `,
        { allowlistContent: testAllowlist },
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('not allowlisted'));
    });

    it('fails on empty host', () => {
      const result = runEgressTest(
        `
        load_egress_allowlist
        assert_egress_allowed_host ""
      `,
        { allowlistContent: testAllowlist },
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('empty'));
    });
  });

  describe('assert_egress_allowed_url', () => {
    const testAllowlist = `
allowlist:
  - api.github.com
  - github.com
  - pypi.org
`;

    it('allows URL with host in allowlist', () => {
      const result = runEgressTest(
        `
        load_egress_allowlist
        assert_egress_allowed_url "https://api.github.com/repos/owner/repo"
        printf 'OK'
      `,
        { allowlistContent: testAllowlist },
      );
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'OK');
    });

    it('rejects URL with host not in allowlist', () => {
      const result = runEgressTest(
        `
        load_egress_allowlist
        assert_egress_allowed_url "https://evil.example.com/steal-secrets"
      `,
        { allowlistContent: testAllowlist },
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('not allowlisted'));
    });

    it('fails on empty URL', () => {
      const result = runEgressTest(
        `
        load_egress_allowlist
        assert_egress_allowed_url ""
      `,
        { allowlistContent: testAllowlist },
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('empty'));
    });
  });
});
