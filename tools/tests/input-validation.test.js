#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fail, section, SAFE_PATH } from './test-utils.js';

section('validation', 'Input validation tests', 'Sourcing validate-inputs.sh');

// Run a shell command with a constrained PATH to avoid tests depending on
// writable or user-controlled directories. Only include fixed, system-owned
// directories that are typically immutable to normal users.
function runShell(cmd) {
  const env = {
    PATH: SAFE_PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    TERM: process.env.TERM || 'dumb',
  };
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', env });
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


// 4) explicit tools input must validate tool ids (lowercase letters, digits and hyphen)
let r2 = runShell(String.raw`source tools/scripts/branding/validate-inputs.sh; tools_raw='badTool!'; tools_trimmed="$(printf '%s' "$tools_raw" | sed 's/^\s*//; s/\s*$//')"; while IFS= read -r t; do t_trim="$(printf '%s' "$t" | sed 's/^\s*//; s/\s*$//')"; if [[ -z "$t_trim" ]]; then continue; fi; if ! printf '%s' "$t_trim" | grep -Eq '^[a-z0-9-]+$'; then v_error "invalid tool id in inputs.tools: $t_trim (allowed: lowercase letters, digits, hyphen)"; exit 1; fi; done <<< "$tools_trimmed"; echo OK`)
if (r2.status === 0 && r2.stdout.includes('OK')) {
  fail('explicit inputs.tools allowed invalid tool id');
}

// 5) bundle=none + extra_tools empty should error early
let r3 = runShell("source tools/scripts/branding/validate-inputs.sh; PS_BUNDLE_INPUT=none; extra_trimmed=''; if [[ \"${PS_BUNDLE_INPUT}\" == \"none\" && -z \"${extra_trimmed}\" ]]; then v_error \"no tools selected (bundle=none and extra_tools empty). If you intended to provide explicit tools, use the 'tools' input.\"; exit 1; fi; echo OK")
if (r3.status === 0 && r3.stdout.includes('OK')) {
  fail('bundle=none + extra_tools empty did not error');
}

process.exit(0);
