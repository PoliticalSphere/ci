// ==============================================================================
// Political Sphere — Validate-CI Filesystem Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide safe file discovery and text loading utilities.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

import { fatal, info } from './console.js';
import { isCI } from './env.js';

export function loadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    fatal(`failed to read file: ${filePath}`);
  }
}

export function listWorkflows(root) {
  const dir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    if (isCI()) {
      fatal(`workflows directory not found at ${dir}`);
    }
    info(`OK (bootstrap): workflows directory not found at ${dir}`);
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
    .map((n) => path.join(dir, n));
}

export function listActionMetadata(root) {
  const dir = path.join(root, '.github', 'actions');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    if (isCI()) {
      fatal(`actions directory not found at ${dir}`);
    }
    info(`OK (bootstrap): actions directory not found at ${dir}`);
    return [];
  }
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const yml = path.join(dir, entry.name, 'action.yml');
    const yaml = path.join(dir, entry.name, 'action.yaml');
    if (fs.existsSync(yml)) files.push(yml);
    else if (fs.existsSync(yaml)) files.push(yaml);
  }
  return files;
}
