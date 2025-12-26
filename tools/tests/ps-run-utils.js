#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { mktemp } from './test-utils.js';

export function createPsRunWorkspace() {
  const tmp = mktemp('psrun-');
  fs.mkdirSync(path.join(tmp, 'logs', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'reports', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'tools', 'scripts', 'branding'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tmp, 'tools', 'scripts', 'branding', 'print-section.sh'),
    '#!/usr/bin/env bash\necho "SECTION: $1 $2 $3"\n',
    { mode: 0o755 },
  );
  return tmp;
}

export function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
  return filePath;
}

export function createScript(tmp, relPath, contents) {
  const absPath = path.join(tmp, relPath);
  writeExecutable(absPath, contents);
  return { relPath, absPath };
}

export function buildPsRunEnv(tmp, overrides = {}) {
  return {
    GITHUB_WORKSPACE: tmp,
    GITHUB_ENV: `${tmp}/gh_env`,
    PS_PLATFORM_ROOT: tmp,
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
    'ps-run.sh',
  );
}

export function getLogPath(tmp, id) {
  return path.join(tmp, 'logs', 'ps-task', `${id}.log`);
}
