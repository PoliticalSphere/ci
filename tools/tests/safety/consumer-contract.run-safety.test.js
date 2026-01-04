#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Consumer Contract Run Safety Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Ensure consumer-contract action does not interpolate inputs in run blocks.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fail, getRepoRoot, section } from '../helpers/test-helpers.js';

const repoRoot = getRepoRoot();
const ymlPath = path.join(
  repoRoot,
  '.github',
  'actions',
  'ps-task',
  'consumer-contract',
  'action.yml',
);

section('safety', 'consumer-contract run safety check', `File: ${ymlPath}`);

if (!fs.existsSync(ymlPath)) {
  // Nothing to do in bootstrap
  process.exit(0);
}

const content = fs.readFileSync(ymlPath, 'utf8');
const lines = content.split(/\r?\n/);
let inRun = false;
const violations = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^\s*run\s*:\s*\|/.test(line)) {
    inRun = true;
    continue;
  }
  if (inRun) {
    // end of run block heuristics: next unindented step or next '- name:' line
    if (/^\s*-[ \t]+name\s*:\s*/.test(line) || /^\S/.test(line)) {
      inRun = false;
    }
  }
  if (inRun) {
    if (/\$\{\{\s*inputs\./.test(line)) {
      violations.push({ line: i + 1, text: line.trim() });
    }
  }
}

if (violations.length > 0) {
  console.error('consumer-contract action unsafe run interpolation:');
  for (const v of violations) {
    console.error(`${path.relative(repoRoot, ymlPath)}:${v.line}: ${v.text}`);
  }
  fail('Found user-controlled interpolation in consumer-contract run block');
}

console.log('OK: consumer-contract run safety check passed');
process.exit(0);
