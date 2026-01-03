#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Action Safety Utilities
// ------------------------------------------------------------------------------
// Purpose:
//   Shared utilities for scanning GitHub Action YAML files for safety issues.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

function getActionsRoot(repoRoot) {
  return path.join(repoRoot, '.github', 'actions');
}

export function listActionYmls(repoRoot) {
  const actionsRoot = getActionsRoot(repoRoot);
  if (!fs.existsSync(actionsRoot) || !fs.statSync(actionsRoot).isDirectory()) {
    return { actionsRoot, files: [] };
  }
  const entries = fs.readdirSync(actionsRoot, { withFileTypes: true });
  const actionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const files = [];
  for (const dir of actionDirs) {
    const ymlPath = path.join(actionsRoot, dir, 'action.yml');
    if (!fs.existsSync(ymlPath)) continue;
    const content = fs.readFileSync(ymlPath, 'utf8');
    files.push({ path: ymlPath, lines: content.split(/\r?\n/) });
  }
  return { actionsRoot, files };
}

export function scanRunBlocks(lines, onLine) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*run\s*:\s*\|/.test(line)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const current = lines[j];
      if (/^\s*-\s+name\s*:\s*/.test(current)) break;
      if (/^\S/.test(current)) break;
      if (/^\s*#/.test(current)) continue;
      onLine(current, j + 1);
    }
  }
}
