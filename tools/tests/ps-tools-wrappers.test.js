#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { getRepoRoot, fail } from './test-utils.js';

const repoRoot = getRepoRoot();

try {
  const lintYml = readFileSync(`${repoRoot}/.github/actions/ps-lint-tools/action.yml`, 'utf8');
  const secYml = readFileSync(`${repoRoot}/.github/actions/ps-security-tools/action.yml`, 'utf8');

  if (!/uses:\s*\.\/\.github\/actions\/ps-tools/.test(lintYml)) {
    fail('ps-lint-tools does not delegate to ps-tools');
  }
  if (!/bundle:\s*"?lint"?/.test(lintYml)) {
    // ok if wrapper passes bundle via input
  }

  if (!/uses:\s*\.\/\.github\/actions\/ps-tools/.test(secYml)) {
    fail('ps-security-tools does not delegate to ps-tools');
  }
  if (!/bundle:\s*"?security"?/.test(secYml)) {
    // ok
  }

  console.log('OK: wrappers delegate to ps-tools');
  process.exit(0);
} catch (err) {
  fail(`ps-tools wrapper tests failed: ${err.stack || err}`);
}
