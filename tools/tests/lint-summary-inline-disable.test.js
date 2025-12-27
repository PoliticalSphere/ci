#!/usr/bin/env node

import { assertLintSummaryOnce, runLintSummary } from './test-utils.js';

// Run the lint summary twice with PS_LINT_INLINE=0 to ensure the summary
// does not duplicate when in-place updates are disabled.
const out = runLintSummary({ PS_LINT_INLINE: '0', TERM: 'xterm' });
assertLintSummaryOnce(out);

console.log('OK: lint summary prints only once when PS_LINT_INLINE=0');
process.exit(0);
