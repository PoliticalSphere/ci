#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  fail,
  mktemp,
  getRepoRoot
} from './test-utils.js';

const repoRoot = getRepoRoot();
const actionYaml = path.join(repoRoot, '.github', 'actions', 'ps-task', 'ps-run', 'action.yml');

import { readYamlFile } from './test-utils.js';
function extractRunScript(outputPath) {
  const y = readYamlFile(actionYaml).doc;
  if (!y || !y.runs || !Array.isArray(y.runs.steps)) {
    fail('action.yml parse failed: run script not found');
  }
  const steps = y.runs.steps;
  let runStr = null;
  for (const s of steps) {
    if (s.id === 'ps_task_run' && s.run) {
      runStr = s.run;
      break;
    }
  }
  if (runStr === null) fail('ps_task_run.run not found in action.yml');
  fs.writeFileSync(outputPath, runStr, { mode: 0o755 });
}

function readLog(tmp, id) {
  const p = path.join(tmp, 'logs', 'ps-task', `${id}.log`);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

// ----------------------------------------------------------------------------
// Test: basic security logging
// ----------------------------------------------------------------------------
(function testBasicLogging() {
  const tmp = mktemp('psrun-');
  // Use the standalone ps-run helper script (simpler environment)
  fs.mkdirSync(path.join(tmp, 'logs', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'reports', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  // Provide a minimal print-section.sh used by ps-run
  fs.mkdirSync(path.join(tmp, 'tools', 'scripts', 'branding'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tools', 'scripts', 'branding', 'print-section.sh'), '#!/usr/bin/env bash\necho "SECTION: $1 $2 $3"\n', { mode: 0o755 });

  // target script placed under platform root
  const scriptRel = 'scripts/echo-args.sh';
  const scriptAbs = path.join(tmp, scriptRel);
  fs.writeFileSync(scriptAbs, '#!/usr/bin/env bash\nset -euo pipefail\necho "SCRIPT-RUN: $@"\n', { mode: 0o755 });

  const id = 'test-basic-logging';
  const title = 'Basic Logging Test';
  const env_kv = 'FOO=1\nBAR=2\n';
  const args = 'alpha beta';

  const env = {
    GITHUB_WORKSPACE: tmp,
    GITHUB_ENV: `${tmp}/gh_env`,
    PS_ID: id,
    PS_TITLE: title,
    PS_DESCRIPTION: '',
    PS_REL_SCRIPT: scriptRel,
    PS_REL_WD: '.',
    PS_ARGS: args,
    PS_ENV_KV: env_kv,
    PS_ALLOW_ARGS: '1',
    PS_PLATFORM_ROOT: tmp,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  };

  // Run the helper script directly
  const helper = path.join(repoRoot, 'tools', 'scripts', 'actions', 'ps-task', 'ps-run.sh');
  try {
    execFileSync('bash', ['-lc', `exec > >(tee -a "${path.join(tmp, 'logs', 'ps-task', `${id}.log`)}") 2>&1; ${helper}`], { encoding: 'utf8', env });
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    fail(`ps-run failed: ${out}`);
  }

  const log = readLog(tmp, id);

  if (!log.includes('task_id=test-basic-logging')) fail('missing task_id log');
  if (!/env_kv_processed count=2/.test(log)) fail('env_kv_processed count mismatch');
  if (!/args_processed count=2/.test(log)) fail('args_processed count mismatch');
  if (!/script_execution path=scripts\/echo-args.sh/.test(log)) fail('script_execution missing');

  console.log('OK: testBasicLogging');
})();

// NOTE: high env var warning needs an integration-style test against the composite action
// in a real runner (process substitution and heredocs behave differently on macOS/local
// execution vs CI). For now, we validate core security logs (env_kv, args, script execution)
// in `testBasicLogging` above; a follow-up will add the composite integration test.

console.log('PS-RUN logging tests passed');
process.exit(0);

console.log('PS-RUN logging tests passed');
process.exit(0);
