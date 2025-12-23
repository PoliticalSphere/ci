#!/usr/bin/env node

// Action input safety checks
// - Ensure no run block contains raw '${{ ... }}' or echo strings that include
//   unescaped '${' patterns (prevents interpolating inputs directly into run blocks)

import fs from 'node:fs';
import path from 'node:path';
import { fail, getRepoRoot, section } from './test-utils.js';

const repoRoot = getRepoRoot();
const actionsRoot = path.join(repoRoot, '.github', 'actions');

section('safety', 'Action input safety checks', `Root: ${actionsRoot}`);

if (!fs.existsSync(actionsRoot) || !fs.statSync(actionsRoot).isDirectory()) {
  // Nothing to do in bootstrap
  process.exit(0);
}

const entries = fs.readdirSync(actionsRoot, { withFileTypes: true });
const actionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

let violations = [];

for (const dir of actionDirs) {
  const ymlPath = path.join(actionsRoot, dir, 'action.yml');
  if (!fs.existsSync(ymlPath)) continue;
  const content = fs.readFileSync(ymlPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*run\s*:\s*\|/.test(line)) {
      // scan subsequent lines until next step (- name: ) or EOF
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (/^\s*-\s+name\s*:\s*/.test(l)) break;
        // skip comments
        if (/^\s*#/.test(l)) continue;

        // detect raw GitHub expressions inside run blocks (e.g. '${{ inputs.xxx }}')
        if (/\{\{\s*inputs\./.test(l) || /\$\{\{/.test(l)) {
          violations.push({ file: ymlPath, line: j + 1, text: l.trim() });
        }
        // detect echo strings that interpolate variables like ${...}
        if (/echo\s+["'].*\$\{[^\}]*["']/.test(l)) {
          violations.push({ file: ymlPath, line: j + 1, text: l.trim() });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nAction input safety violations detected:');
  for (const v of violations) {
    console.error(`${path.relative(repoRoot, v.file)}:${v.line}: ${v.text}`);
  }
  fail('Found unsafe input interpolation inside run blocks.');
}

process.exit(0);
