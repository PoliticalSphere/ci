// ==============================================================================
// Political Sphere — Validate-CI Environment Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide environment and repo-root utilities for Validate-CI.
// ==============================================================================

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import { getSafePathEnv } from './safe-path.js';

export function isCI() {
  return String(process.env.CI || '0') === '1';
}

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
