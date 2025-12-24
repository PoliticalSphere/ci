#!/usr/bin/env node

import { runLintSummary, assertLintSummaryOnce } from './test-utils.js';

// Run the lint summary in a CI-like, non-TTY context and assert it prints once.
const out = runLintSummary({ CI: '1', TERM: 'dumb' });
assertLintSummaryOnce(out);

console.log('OK: lint summary prints only once in non-TTY mode');
process.exit(0);
