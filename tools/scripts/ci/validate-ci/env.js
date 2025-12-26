// ==============================================================================
// Political Sphere — Validate-CI Environment Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide environment and repo-root utilities for Validate-CI.
// ==============================================================================

import { spawnSync } from 'node:child_process';

import { getSafePathEnv } from './safe-path.js';

export function isCI() {
  return String(process.env.CI || '0') === '1';
}

export function getRepoRoot() {
  try {
    const safePath = getSafePathEnv();
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      env: { PATH: safePath },
    });
    if (r && r.status === 0) return String(r.stdout || '').trim();
    return process.cwd();
  } catch {
    return process.cwd();
  }
}
