#!/usr/bin/env node

import {
  compileRegex,
  setRegexEngineForTest,
} from '../scripts/ci/validate-ci/checks.js';
import { fail, section } from './test-utils.js';

function assert(condition, message) {
  if (!condition) fail(message);
}

try {
  section('unit', 'regex safety: nested unbounded quantifiers');

  // Expect rejection with a specific error message (handle the exception explicitly)
  let threw = false;
  try {
    compileRegex(String.raw`(.+)+`);
    // If no error thrown, fail early
    fail("expected compileRegex('(.+)+') to throw an error");
  } catch (err) {
    threw = true;
    // Ensure the error is the unsafe-regex error we expect
    if (!String(err?.message || '').includes('unsafe regex pattern detected')) {
      throw new Error(`expected unsafe regex error, got: ${String(err)}`);
    }
  }
  assert(threw, "expected compileRegex to reject '(.+)+'");

  // Allowed case: bounded repetition should not be rejected — if it throws, propagate the error
  try {
    compileRegex(String.raw`(\\.[0-9]+){0,2}$`);
  } catch (err) {
    throw new Error(
      `expected compileRegex('(\\.[0-9]+){0,2}$') to succeed but it threw: ${String(
        err,
      )}`,
    );
  }

  // Test override hook: ensure a provided engine is used when set
  class FakeEngine {
    constructor(pat, flags) {
      this.pat = pat;
      this.flags = flags;
    }
    test() {
      return false;
    }
  }

  setRegexEngineForTest(FakeEngine);
  const inst = compileRegex('abc');
  assert(inst instanceof FakeEngine, 'expected FakeEngine to be used');
  // Reset override
  setRegexEngineForTest(null);

  console.log('OK: regex safety checks passed');
  process.exit(0);
} catch (err) {
  fail(err?.stack || err?.message || String(err));
}