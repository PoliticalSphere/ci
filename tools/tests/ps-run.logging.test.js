#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { getSafePathEnv } from '../scripts/ci/validate-ci/safe-path.js';
import { fail, getRepoRoot } from './test-utils.js';
import {
  buildPsRunEnv,
  createPsRunWorkspace,
  createScript,
  getLogPath,
  getPsRunHelper,
} from './ps-run-utils.js';

const repoRoot = getRepoRoot();

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return '';
  return fs.readFileSync(logPath, 'utf8');
}

// ----------------------------------------------------------------------------
// Test: basic security logging
// ----------------------------------------------------------------------------
(function testBasicLogging() {
  const tmp = createPsRunWorkspace();

  // target script placed under platform root
  const scriptRel = 'scripts/echo-args.sh';
  createScript(
    tmp,
    scriptRel,
    '#!/usr/bin/env bash\nset -euo pipefail\necho "SCRIPT-RUN: $@"\n',
  );

  const id = 'test-basic-logging';
  const title = 'Basic Logging Test';
  const env_kv = 'FOO=1\nBAR=2\n';
  const args = 'alpha beta';

  const env = buildPsRunEnv(tmp, {
    PS_ID: id,
    PS_TITLE: title,
    PS_DESCRIPTION: '',
    PS_REL_SCRIPT: scriptRel,
    PS_REL_WD: '.',
    PS_ARGS: args,
    PS_ENV_KV: env_kv,
    PS_ALLOW_ARGS: '1',
  });

  // Run the helper script directly
  const helper = getPsRunHelper(repoRoot);
  const logPath = getLogPath(tmp, id);
  const command = `exec > "${logPath}" 2>&1; ${helper}`;
  try {
    let safePath = '';
    try {
      safePath = getSafePathEnv();
    } catch (err) {
      fail(`Safe PATH validation failed: ${err?.message || err}`);
    }
    env.PATH = safePath;
    execFileSync('bash', ['-lc', command], { encoding: 'utf8', env });
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    fail(`ps-run failed: ${out}`);
  }

  const log = readLog(logPath);

  if (!log.includes('task_id=test-basic-logging')) fail('missing task_id log');
  if (!/env_kv_processed count=2/.test(log))
    fail('env_kv_processed count mismatch');
  if (!/args_processed count=2/.test(log))
    fail('args_processed count mismatch');
  if (!/script_execution path=scripts\/echo-args.sh/.test(log))
    fail('script_execution missing');

  console.log('OK: testBasicLogging');
})();

// NOTE: high env var warning needs an integration-style test against the composite action
// in a real runner (process substitution and heredocs behave differently on macOS/local
// execution vs CI). For now, we validate core security logs (env_kv, args, script execution)
// in `testBasicLogging` above; a follow-up will add the composite integration test.

console.log('PS-RUN logging tests passed');
process.exit(0);
