// ==============================================================================
// Political Sphere - CLI Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Shared helpers for CLI-style Node scripts (argument parsing + IO).
// ==============================================================================

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getSafePathEnv } from './safe-path.js';

// -----------------------------------------------------------------------------
// Environment Detection
// -----------------------------------------------------------------------------

/**
 * Check if running in CI environment.
 * @returns {boolean} True if CI=1
 */
export function isCI() {
  return String(process.env.CI || '0') === '1';
}

// -----------------------------------------------------------------------------
// Repository Root Discovery
// -----------------------------------------------------------------------------

/**
 * Get the repository root directory with security-aware fallbacks.
 * Checks PS_REPO_ROOT and GITHUB_WORKSPACE before falling back to git.
 * @returns {string} Absolute path to repository root
 * @throws {Error} If no valid root can be determined
 */
export function getRepoRoot() {
  const configured =
    process.env.PS_REPO_ROOT || process.env.GITHUB_WORKSPACE || '';
  if (configured) {
    if (!fs.existsSync(configured) || !fs.statSync(configured).isDirectory()) {
      throw new Error(`repo root not found at ${configured}`);
    }
    return configured;
  }

  let safePath = '';
  try {
    safePath = getSafePathEnv();
  } catch (err) {
    throw new Error(`Safe PATH validation failed: ${err?.message || err}`);
  }

  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    env: { PATH: safePath },
  });
  const root = r && r.status === 0 ? String(r.stdout || '').trim() : '';
  if (root) return root;

  throw new Error(
    'repo root not configured and git root unavailable; set PS_REPO_ROOT',
  );
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const optionKey = arg.slice(2);
    const optionValue = argv[i + 1];
    if (!optionValue || optionValue.startsWith('--')) {
      args[optionKey] = true;
    } else {
      args[optionKey] = optionValue;
    }
  }
  return args;
}

export function resolvePath(root, input) {
  if (!input) return '';
  if (!root) {
    throw new Error('repo root is required to resolve paths');
  }
  const resolved = path.resolve(root, input);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes repo root: ${input}`);
  }
  return resolved;
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureParentDir(filePath) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeOutputs({
  reportPath,
  summaryPath,
  reportData,
  summaryLines,
}) {
  if (reportPath) {
    ensureParentDir(reportPath);
    fs.writeFileSync(reportPath, `${JSON.stringify(reportData, null, 2)}\n`);
  }

  if (summaryPath) {
    ensureParentDir(summaryPath);
    const lines = Array.isArray(summaryLines) ? summaryLines : [];
    fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
  }
}
