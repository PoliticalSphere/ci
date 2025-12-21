// ==============================================================================
// Political Sphere — Validate-CI Environment Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide environment and repo-root utilities for Validate-CI.
// ==============================================================================

import { execSync } from 'node:child_process';

export function isCI() {
  return String(process.env.CI || '0') === '1';
}

export function getRepoRoot() {
  try {
    const out = execSync('git rev-parse --show-toplevel', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.trim();
  } catch {
    return process.cwd();
  }
}
