#!/usr/bin/env node

import { fail, section } from './test-utils.js';
import { compileRegex } from '../scripts/ci/validate-ci/checks.js';

function assert(condition, message) {
  if (!condition) fail(message);
}

try {
  section('unit', 'regex safety: nested unbounded quantifiers');

  let threw = false;
  try {
    compileRegex('(.+)+');
  } catch (err) {
    threw = true;
  }
  assert(threw, "expected compileRegex to reject '(.+)+'");

  // Allowed case: bounded repetition should not be rejected
  threw = false;
  try {
    compileRegex('(\\.[0-9]+){0,2}$');
  } catch (err) {
    threw = true;
  }
  assert(!threw, "expected compileRegex to accept '(\\.[0-9]+){0,2}$'");

  console.log('OK: regex safety checks passed');
  process.exit(0);
} catch (err) {
  fail(err?.stack || err?.message || String(err));
}
