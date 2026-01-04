#!/usr/bin/env node

// ==============================================================================
// Political Sphere — PS Run Test Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Shared utilities for testing ps-run script functionality.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { mktemp } from './test-helpers.js';

export function createPsRunWorkspace() {
  const workspaceRoot = mktemp('psrun-');
  fs.mkdirSync(path.join(workspaceRoot, 'logs', 'ps-task'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workspaceRoot, 'reports', 'ps-task'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workspaceRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'tools', 'scripts', 'branding'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(
      workspaceRoot,
      'tools',
      'scripts',
      'branding',
      'format.sh',
    ),
    '#!/usr/bin/env bash\nps_print_section() { echo "SECTION: $1 $2 $3"; }\n',
    { mode: 0o755 },
  );
  return workspaceRoot;
}

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
  return filePath;
}

export function createScript(workspaceRoot, relPath, contents) {
  const absPath = path.join(workspaceRoot, relPath);
  writeExecutable(absPath, contents);
  return { relPath, absPath };
}

export function buildPsRunEnv(workspaceRoot, overrides = {}) {
  return {
    GITHUB_WORKSPACE: workspaceRoot,
    GITHUB_ENV: `${workspaceRoot}/gh_env`,
    PS_PLATFORM_ROOT: workspaceRoot,
    PATH: '',
    HOME: process.env.HOME,
    ...overrides,
  };
}

export function getPsRunHelper(repoRoot) {
  return path.join(
    repoRoot,
    'tools',
    'scripts',
    'actions',
    'ps-task',
    'run.sh',
  );
}

export function getLogPath(workspaceRoot, id) {
  return path.join(workspaceRoot, 'logs', 'ps-task', `${id}.log`);
}
