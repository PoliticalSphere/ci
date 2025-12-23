#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fail, section } from './test-utils.js';

section('validation', 'Input validation tests', 'Sourcing validate-inputs.sh');

function runShell(cmd) {
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
  return r;
}

// 1) Tools allow-list rejects malicious content
let r = runShell(
  "source tools/scripts/branding/validate-inputs.sh; tools_raw='actionlint,rm -rf /'; require_regex 'inputs.tools' \"$tools_raw\" '^[a-z0-9,-]+$' 'hint' || exit 0; echo OK",
);
if (r.status === 0 && r.stdout.includes('OK')) {
  fail('require_regex allowed malicious tools_raw');
}

// 2) require_nonempty rejects empty
r = runShell(
  "source tools/scripts/branding/validate-inputs.sh; require_nonempty 'inputs.script' '' || exit 0; echo OK",
);
if (r.status === 0 && r.stdout.includes('OK')) {
  fail('require_nonempty accepted empty value');
}

// 3) require_number rejects non-number
r = runShell(
  "source tools/scripts/branding/validate-inputs.sh; require_number 'inputs.node_version' 'foo' || exit 0; echo OK",
);
if (r.status === 0 && r.stdout.includes('OK')) {
  fail('require_number accepted non-number');
}

process.exit(0);
