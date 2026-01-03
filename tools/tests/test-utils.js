// ==============================================================================
// Political Sphere — Test Utilities
// ------------------------------------------------------------------------------
// Purpose:
//   Shared utilities for test files including console helpers and file loading.
// ==============================================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

// Reuse console helpers from Validate-CI to avoid duplication across the repo.
export {
  detail,
  getRepoRoot,
  info,
  isCI,
  section,
} from '../scripts/workflows/ci/validate-ci/console.js';

export function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
export function mktemp(prefix = 'vcitest-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function readYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return { raw, doc: YAML.parse(raw) };
  } catch (err) {
    fail(`YAML parse failed: ${filePath}\n${err?.message || err}`);
  }
}

export function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function assertContains(text, needle, rel, hint) {
  if (!text.includes(needle)) {
    fail(`${rel}: missing required content: ${needle}\nHINT: ${hint}`);
  }
}

import { execFileSync } from 'node:child_process';
import { getRepoRoot } from '../scripts/workflows/ci/validate-ci/console.js';
import { getSafePathEnv } from '../scripts/workflows/ci/validate-ci/safe-path.js';

export const SAFE_PATH = getSafePathEnv();

export function buildSafeEnv(overrides = {}) {
  let safePath = '';
  try {
    safePath = getSafePathEnv();
  } catch (err) {
    fail(`Safe PATH validation failed: ${err?.message || err}`);
  }
  return {
    PATH: safePath,
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: process.env.TERM || 'dumb',
    ...overrides,
  };
}

export function runLintSummary(envOverrides = {}) {
  const repoRoot = getRepoRoot();
  const env = buildSafeEnv({ TERM: 'dumb', ...envOverrides });
  const commandString = `source "${repoRoot}/tools/scripts/gates/gate-common.sh"; lint_init || true; print_lint_summary; print_lint_summary`;
  let out = '';
  try {
    out = execFileSync('bash', ['-lc', commandString], {
      encoding: 'utf8',
      cwd: repoRoot,
      env,
      timeout: 30_000,
    });
  } catch (err) {
    out = (err.stdout || '') + (err.stderr || '');
  }
  return out;
}

export function assertLintSummaryOnce(out, rel = 'lint summary') {
  const filtered = String(out)
    .split('\n')
    .filter((line) => !line.startsWith('PS.LOG '))
    .join('\n');
  // Match either old header "LINT & TYPE CHECK" or new header "Linter Results"
  const headerCount = (
    filtered.match(/LINT & TYPE CHECK|Linter Results/g) || []
  ).length;
  if (headerCount !== 1) {
    fail(
      `${rel}: Unexpected header count: expected 1, found ${headerCount}\nOutput:\n${filtered}`,
    );
  }

  const biomeCount = (filtered.match(/BIOME/g) || []).length;
  if (biomeCount !== 1) {
    fail(
      `${rel}: Unexpected BIOME row count: expected 1, found ${biomeCount}\nOutput:\n${filtered}`,
    );
  }
}
