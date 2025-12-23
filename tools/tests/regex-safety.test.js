#!/usr/bin/env node

import { fail, section } from './test-utils.js';
import {
  compileRegex,
  setRegexEngineForTest,
} from '../scripts/ci/validate-ci/checks.js';

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
