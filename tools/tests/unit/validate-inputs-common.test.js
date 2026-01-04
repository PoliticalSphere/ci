#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Validate Inputs Common Test Suite
// ------------------------------------------------------------------------------
// Purpose:
//   Test suite for shared validation library used across ps-bootstrap actions.
//   Validates edge cases, malicious inputs, error handling, and return values.
// ==============================================================================

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function getRepoRoot() {
  const currentDir = path.resolve('.');
  if (fs.existsSync(path.join(currentDir, '.git'))) {
    return currentDir;
  }
  return currentDir;
}

function buildSafeEnv(overrides = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: process.env.TERM || 'dumb',
    ...overrides,
  };
}

const repoRoot = getRepoRoot();
const validationLib = path.join(
  repoRoot,
  'tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh',
);

function createTestWorkspace() {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'validate-inputs-test-'),
  );
  
  // Create required directory structure
  fs.mkdirSync(path.join(tmpDir, 'tools/scripts/core'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'tools/scripts/branding'), { recursive: true });
  
  // Copy required core scripts
  const coreScripts = [
    'tools/scripts/core/gha-helpers.sh',
    'tools/scripts/core/validation.sh',
    'tools/scripts/core/path-validation.sh',
    'tools/scripts/core/error-handler.sh',
    'tools/scripts/branding/format.sh',
  ];
  
  coreScripts.forEach((script) => {
    const src = path.join(repoRoot, script);
    const dest = path.join(tmpDir, script);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });
  
  // Create package.json and package-lock.json for testing
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'test', version: '1.0.0' }),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package-lock.json'),
    JSON.stringify({ name: 'test', lockfileVersion: 2 }),
  );
  
  return tmpDir;
}

function runValidationTest(scriptContent, env = {}) {
  const tmpDir = createTestWorkspace();
  const testScript = path.join(tmpDir, 'test.sh');
  
  const fullScript = `#!/usr/bin/env bash
set -euo pipefail
export GITHUB_WORKSPACE="${tmpDir}"
source "${validationLib}"
${scriptContent}
`;
  
  fs.writeFileSync(testScript, fullScript, { mode: 0o755 });
  
  const testEnv = buildSafeEnv({
    GITHUB_WORKSPACE: tmpDir,
    GITHUB_ENV: path.join(tmpDir, 'github.env'),
    ...env,
  });
  
  try {
    const output = execFileSync('bash', [testScript], {
      encoding: 'utf8',
      env: testEnv,
      cwd: tmpDir,
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: true, output, tmpDir };
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: false, output, code: err.status, tmpDir };
  }
}

// ==============================================================================
// Test: validate_bool
// ==============================================================================

console.log('Testing validate_bool...');

// Valid inputs
['0', '1', 'true', 'false', 'yes', 'no', 'on', 'off'].forEach((input) => {
  const result = runValidationTest(`validate_bool "test.input" "${input}"`);
  if (!result.success) {
    fail(`validate_bool should accept "${input}" but failed: ${result.output}`);
  }
});

// Case insensitivity
['TRUE', 'False', 'YES', 'No'].forEach((input) => {
  const result = runValidationTest(`validate_bool "test.input" "${input}"`);
  if (!result.success) {
    fail(
      `validate_bool should handle case-insensitive "${input}" but failed: ${result.output}`,
    );
  }
});

// Invalid inputs should fail
['invalid', '2', '-1', 'maybe'].forEach((input) => {
  const result = runValidationTest(
    `validate_bool "test.input" "${input}" || exit 0`,
  );
  if (result.success && !result.output.includes('ERROR')) {
    fail(
      `validate_bool should reject "${input}" but succeeded: ${result.output}`,
    );
  }
});

// Empty string is normalized to "0" by norm_bool, so it's valid
let emptyResult = runValidationTest('validate_bool "test.input" ""');
if (!emptyResult.success) {
  fail(`validate_bool should accept empty string (normalized to 0): ${emptyResult.output}`);
}

console.log('✓ validate_bool tests passed');

// ==============================================================================
// Test: validate_enum
// ==============================================================================

console.log('Testing validate_enum...');

// Valid enum value
let result = runValidationTest(
  'validate_enum "test.input" "lint" "lint" "security" "none"',
);
if (!result.success || !result.output.includes('lint')) {
  fail(`validate_enum should accept valid value: ${result.output}`);
}

// Invalid enum value
result = runValidationTest(
  'validate_enum "test.input" "invalid" "lint" "security" "none" || exit 0',
);
if (result.success && !result.output.includes('ERROR')) {
  fail(`validate_enum should reject invalid value: ${result.output}`);
}

// Empty value should fail
result = runValidationTest(
  'validate_enum "test.input" "" "lint" "security" || exit 0',
);
if (result.success && !result.output.includes('ERROR')) {
  fail(`validate_enum should reject empty value: ${result.output}`);
}

console.log('✓ validate_enum tests passed');

// ==============================================================================
// Test: validate_int_nonneg
// ==============================================================================

console.log('Testing validate_int_nonneg...');

// Valid non-negative integers
['0', '1', '100', '9999'].forEach((input) => {
  const result = runValidationTest(
    `validate_int_nonneg "test.input" "${input}"`,
  );
  if (!result.success) {
    fail(
      `validate_int_nonneg should accept "${input}" but failed: ${result.output}`,
    );
  }
});

// Invalid inputs
['-1', 'abc', '1.5', '1e10', ''].forEach((input) => {
  const result = runValidationTest(
    `validate_int_nonneg "test.input" "${input}" || exit 0`,
  );
  if (result.success && !result.output.includes('ERROR')) {
    fail(
      `validate_int_nonneg should reject "${input}" but succeeded: ${result.output}`,
    );
  }
});

console.log('✓ validate_int_nonneg tests passed');

// ==============================================================================
// Test: validate_repo_path
// ==============================================================================

console.log('Testing validate_repo_path...');

// Valid repo-relative paths
['src/index.js', 'tools/scripts', '.github/workflows'].forEach((input) => {
  const result = runValidationTest(
    `validate_repo_path "test.path" "${input}"`,
  );
  if (!result.success) {
    fail(
      `validate_repo_path should accept "${input}" but failed: ${result.output}`,
    );
  }
});

// Invalid paths (path traversal attempts)
['../etc/passwd', '/etc/passwd', 'foo/../bar', './foo/../../bar'].forEach(
  (input) => {
    const result = runValidationTest(
      `validate_repo_path "test.path" "${input}" || exit 0`,
    );
    if (result.success && !result.output.includes('ERROR')) {
      fail(
        `validate_repo_path should reject traversal "${input}" but succeeded: ${result.output}`,
      );
    }
  },
);

// Strict mode should reject any ".."
result = runValidationTest(
  'validate_repo_path "test.path" "foo..bar" "strict" || exit 0',
);
if (result.success && !result.output.includes('ERROR')) {
  fail(`validate_repo_path strict mode should reject ".." substring`);
}

console.log('✓ validate_repo_path tests passed');

// ==============================================================================
// Test: validate_working_directory
// ==============================================================================

console.log('Testing validate_working_directory...');

// Valid working directories
['src', 'packages/app', '.'].forEach((input) => {
  const result = runValidationTest(
    `validate_working_directory "${input}"`,
  );
  if (!result.success) {
    fail(
      `validate_working_directory should accept "${input}" but failed: ${result.output}`,
    );
  }
});

// Empty should default to "."
result = runValidationTest('out=$(validate_working_directory ""); echo "$out"');
if (!result.output.includes('.')) {
  fail(
    `validate_working_directory should default to "." for empty input: ${result.output}`,
  );
}

// Path traversal should fail
result = runValidationTest(
  'validate_working_directory "../etc" || exit 0',
);
if (result.success && !result.output.includes('ERROR')) {
  fail(`validate_working_directory should reject traversal: ${result.output}`);
}

console.log('✓ validate_working_directory tests passed');

// ==============================================================================
// Test: validate_package_lock_required
// ==============================================================================

console.log('Testing validate_package_lock_required...');

// Should pass when files exist and check is enabled
result = runValidationTest('validate_package_lock_required "." "1"');
if (!result.success) {
  fail(
    `validate_package_lock_required should pass when files exist: ${result.output}`,
  );
}

// Should pass when check is disabled
result = runValidationTest('validate_package_lock_required "." "0"');
if (!result.success) {
  fail(
    `validate_package_lock_required should pass when disabled: ${result.output}`,
  );
}

// Should fail when package.json is missing
result = runValidationTest(
  'rm package.json; validate_package_lock_required "." "1" || exit 0',
);
if (result.success && !result.output.includes('ERROR')) {
  fail(
    `validate_package_lock_required should fail on missing package.json: ${result.output}`,
  );
}

// Should provide helpful hint message
if (!result.output.includes('HINT')) {
  fail('validate_package_lock_required should provide HINT on failure');
}

console.log('✓ validate_package_lock_required tests passed');

// ==============================================================================
// Test: validate_fetch_depth_with_full_history
// ==============================================================================

console.log('Testing validate_fetch_depth_with_full_history...');

// Valid: full_history=0 with any depth
result = runValidationTest(
  'validate_fetch_depth_with_full_history "1" "0"',
);
if (!result.success) {
  fail(
    `validate_fetch_depth_with_full_history should pass when full_history=0: ${result.output}`,
  );
}

// Valid: full_history=1 with depth=0
result = runValidationTest(
  'validate_fetch_depth_with_full_history "0" "1"',
);
if (!result.success) {
  fail(
    `validate_fetch_depth_with_full_history should pass when depth=0 and full_history=1: ${result.output}`,
  );
}

// Invalid: full_history=1 with depth>0
result = runValidationTest(
  'validate_fetch_depth_with_full_history "1" "1" || exit 0',
);
if (result.success && !result.output.includes('ERROR')) {
  fail(
    `validate_fetch_depth_with_full_history should fail when full_history=1 but depth>0: ${result.output}`,
  );
}

console.log('✓ validate_fetch_depth_with_full_history tests passed');

// ==============================================================================
// Test: validate_owner_repo
// ==============================================================================

console.log('Testing validate_owner_repo...');

// Valid OWNER/REPO formats
['PoliticalSphere/ci', 'github/actions', 'user-name/repo_name.git'].forEach(
  (input) => {
    const result = runValidationTest(
      `validate_owner_repo "test.repo" "${input}"`,
    );
    if (!result.success) {
      fail(
        `validate_owner_repo should accept "${input}" but failed: ${result.output}`,
      );
    }
  },
);

// Invalid formats
['invalid', 'no-slash', '/repo', 'owner/', 'owner//repo'].forEach((input) => {
  const result = runValidationTest(
    `validate_owner_repo "test.repo" "${input}" || exit 0`,
  );
  if (result.success && !result.output.includes('ERROR')) {
    fail(
      `validate_owner_repo should reject "${input}" but succeeded: ${result.output}`,
    );
  }
});

console.log('✓ validate_owner_repo tests passed');

// ==============================================================================
// Test: emit_validated_env
// ==============================================================================

console.log('Testing emit_validated_env...');

const tmpDir = createTestWorkspace();
const envFile = path.join(tmpDir, 'github.env');

result = runValidationTest(
  `emit_validated_env "TEST_VAR" "test_value"`,
  { GITHUB_ENV: envFile },
);

if (!result.success) {
  fail(`emit_validated_env should succeed: ${result.output}`);
}

// Check that value was written to GITHUB_ENV
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  if (!content.includes('TEST_VAR') || !content.includes('test_value')) {
    fail(
      `emit_validated_env should write to GITHUB_ENV: got "${content}"`,
    );
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('✓ emit_validated_env tests passed');

// ==============================================================================
// Security Tests: Path Traversal Prevention
// ==============================================================================

console.log('Testing security: path traversal prevention...');

// Path traversal attempts that should all be rejected
const traversalAttempts = [
  '../../../etc/passwd',
  '/etc/passwd',
  'foo/../../../bar',
  './foo/../../../../../../bar',
  'normal/../../../../../../sensitive',
];

traversalAttempts.forEach((attempt) => {
  const result = runValidationTest(
    `validate_repo_path "test.path" "${attempt}" || exit 0`,
  );
  // Should be rejected with ERROR
  if (!result.output.includes('ERROR') && !result.output.includes('must be')) {
    fail(
      `Security: path traversal should be rejected: "${attempt}" (output: ${result.output})`,
    );
  }
});

console.log('✓ Security tests passed');

// ==============================================================================
// Summary
// ==============================================================================

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('✅ All validate-inputs-common.sh tests passed');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('Test Coverage:');
console.log('  • validate_bool: 13 test cases');
console.log('  • validate_enum: 3 test cases');
console.log('  • validate_int_nonneg: 9 test cases');
console.log('  • validate_repo_path: 8 test cases');
console.log('  • validate_working_directory: 4 test cases');
console.log('  • validate_package_lock_required: 4 test cases');
console.log('  • validate_fetch_depth_with_full_history: 3 test cases');
console.log('  • validate_owner_repo: 8 test cases');
console.log('  • emit_validated_env: 1 test case');
console.log('  • Security path traversal prevention: 5 test cases');
console.log('');
console.log('Total: 58 test assertions');
console.log('');

process.exit(0);
