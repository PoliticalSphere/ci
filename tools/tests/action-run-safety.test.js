#!/usr/bin/env node

// Scan all composite actions and ensure no run blocks interpolate inputs directly
// (i.e., no occurrences of '${{ inputs.* }}' inside run: | blocks)

import fs from 'node:fs';
import path from 'node:path';
import { fail, getRepoRoot, section } from './test-utils.js';

const repoRoot = getRepoRoot();
const actionsRoot = path.join(repoRoot, '.github', 'actions');

section('safety', 'Action run-block input interpolation checks', `Root: ${actionsRoot}`);

if (!fs.existsSync(actionsRoot) || !fs.statSync(actionsRoot).isDirectory()) {
  // Nothing to do in bootstrap
  process.exit(0);
}

const entries = fs.readdirSync(actionsRoot, { withFileTypes: true });
const actionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

const violations = [];

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
        if (/^\s*-[ \t]+name\s*:\s*/.test(l)) break;
        if (/^\S/.test(l)) break; // end of indented run block
        // skip comments
        if (/^\s*#/.test(l)) continue;

        if (/\{\{\s*inputs\./.test(l) || /\$\{\{\s*inputs\./.test(l)) {
          violations.push({ file: ymlPath, line: j + 1, text: l.trim() });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nAction run-block input safety violations detected:');
  for (const v of violations) {
    console.error(`${path.relative(repoRoot, v.file)}:${v.line}: ${v.text}`);
  }
  fail('Found unsafe input interpolation inside run blocks of composite actions.');
}

console.log('OK: action run-block input interpolation checks passed');
process.exit(0);
