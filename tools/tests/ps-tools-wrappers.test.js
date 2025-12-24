#!/usr/bin/env node
import fs from 'node:fs';
import { fail, getRepoRoot } from './test-utils.js';

const repoRoot = getRepoRoot();

try {
  // Ensure wrapper actions were removed
  if (fs.existsSync(`${repoRoot}/.github/actions/ps-lint-tools`)) {
    fail('ps-lint-tools should be removed; use ps-tools with bundle=lint');
  }
  if (fs.existsSync(`${repoRoot}/.github/actions/ps-security-tools`)) {
    fail(
      'ps-security-tools should be removed; use ps-tools with bundle=security',
    );
  }

  // Ensure ps-tools supports the expected bundle inputs
  const yml = fs.readFileSync(
    `${repoRoot}/.github/actions/ps-tools/action.yml`,
    'utf8',
  );
  if (
    !/bundle:\s*"?lint"?/.test(yml) ||
    (!/bundle:\s*"?security"?/.test(yml) && !/bundle:/.test(yml))
  ) {
    fail('ps-tools does not declare expected bundle input (lint|security)');
  }

  console.log('OK: ps-tools is canonical and wrappers are removed');
  process.exit(0);
} catch (err) {
  fail(`ps-tools wrapper tests failed: ${err.stack || err}`);
}
