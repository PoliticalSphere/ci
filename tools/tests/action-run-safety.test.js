#!/usr/bin/env node

// Scan all composite actions and ensure no run blocks interpolate inputs directly
// (i.e., no occurrences of '${{ inputs.* }}' inside run: | blocks)

import path from 'node:path';
import { fail, getRepoRoot, section } from './test-utils.js';
import { listActionYmls, scanRunBlocks } from './action-safety-utils.js';

const repoRoot = getRepoRoot();
const { actionsRoot, files } = listActionYmls(repoRoot);

section(
  'safety',
  'Action run-block input interpolation checks',
  `Root: ${actionsRoot}`,
);

if (files.length === 0) {
  // Nothing to do in bootstrap
  process.exit(0);
}

const violations = [];

for (const file of files) {
  scanRunBlocks(file.lines, (line, lineNumber) => {
    // detect input interpolation inside run blocks
    if (/\{\{\s*inputs\./.test(line) || /\$\{\{\s*inputs\./.test(line)) {
      violations.push({
        file: file.path,
        line: lineNumber,
        text: line.trim(),
        reason: 'inputs interpolation',
      });
      return;
    }
    // detect secrets interpolation (including github.token)
    if (
      /\{\{\s*secrets\./.test(line) ||
      /\$\{\{\s*secrets\./.test(line) ||
      /\{\{\s*github\.token\s*\}\}/.test(line) ||
      /\$\{\{\s*github\.token\s*\}\}/.test(line)
    ) {
      violations.push({
        file: file.path,
        line: lineNumber,
        text: line.trim(),
        reason: 'secrets interpolation',
      });
    }
  });
}

if (violations.length > 0) {
  console.error('\nAction run-block input safety violations detected:');
  for (const v of violations) {
    console.error(`${path.relative(repoRoot, v.file)}:${v.line}: ${v.text}`);
  }
  fail(
    'Found unsafe input interpolation inside run blocks of composite actions.',
  );
}

console.log('OK: action run-block input interpolation checks passed');
process.exit(0);
