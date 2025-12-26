#!/usr/bin/env node

// Action input safety checks
// - Ensure no run block contains raw '${{ ... }}' or echo strings that include
//   unescaped '${' patterns (prevents interpolating inputs directly into run blocks)

import path from 'node:path';
import { fail, getRepoRoot, section } from './test-utils.js';
import { listActionYmls, scanRunBlocks } from './action-safety-utils.js';

const repoRoot = getRepoRoot();
const { actionsRoot, files } = listActionYmls(repoRoot);

section('safety', 'Action input safety checks', `Root: ${actionsRoot}`);

if (files.length === 0) {
  // Nothing to do in bootstrap
  process.exit(0);
}

const violations = [];

for (const file of files) {
  scanRunBlocks(file.lines, (line, lineNumber) => {
    // detect raw GitHub expressions inside run blocks (e.g. '${{ inputs.xxx }}')
    if (/\{\{\s*inputs\./.test(line) || /\$\{\{/.test(line)) {
      violations.push({ file: file.path, line: lineNumber, text: line.trim() });
    }
    // detect echo strings that interpolate variables like ${...}
    if (/echo\s+["'].*\$\{[^}]*\}.*["']/.test(line)) {
      violations.push({ file: file.path, line: lineNumber, text: line.trim() });
    }
  });
}

if (violations.length > 0) {
  console.error('\nAction input safety violations detected:');
  for (const v of violations) {
    console.error(`${path.relative(repoRoot, v.file)}:${v.line}: ${v.text}`);
  }
  fail('Found unsafe input interpolation inside run blocks.');
}

process.exit(0);
