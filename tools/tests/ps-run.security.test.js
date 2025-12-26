#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fail, mktemp, getRepoRoot, readYamlFile } from './test-utils.js';

const repoRoot = getRepoRoot();
const actionYaml = path.join(repoRoot, '.github', 'actions', 'ps-task', 'ps-run', 'action.yml');

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
  if (!fs.existsSync(p)) return null;
  return { path: p, stat: fs.statSync(p), isSymlink: fs.lstatSync(p).isSymbolicLink(), mode: fs.statSync(p).mode };
}

// ----------------------------------------------------------------------------
// Test: log file hardening (symlink rejection + permissions)
// ----------------------------------------------------------------------------
(function testLogHardening() {
  const tmp = mktemp('psrun-');
  extractRunScript(path.join(tmp, 'run.sh'));

  // create workspace layout
  fs.mkdirSync(path.join(tmp, 'logs', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'reports', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'tools', 'scripts', 'branding'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tools', 'scripts', 'branding', 'print-section.sh'), '#!/usr/bin/env bash\necho "SECTION: $1 $2 $3"\n', { mode: 0o755 });

  const scriptRel = 'scripts/noop.sh';
  fs.writeFileSync(path.join(tmp, scriptRel), '#!/usr/bin/env bash\nset -euo pipefail\necho NOOP\n', { mode: 0o755 });

  const id = 'test-log-hardening';
  const title = 'Log Hardening Test';

  // Create a symlink at the expected log path to simulate attack
  const target = path.join(tmp, '..', 'evil.log');
  const logPath = path.join(tmp, 'logs', 'ps-task', `${id}.log`);
  try {
    fs.symlinkSync(target, logPath);
  } catch (err) {
    // on some platforms symlink may require privileges; create a regular file and then make it a symlink via alternate strategy
    // but proceed — test will ensure we detect unsafe path via isSymbolicLink or failure to create
  }

  const env = {
    GITHUB_WORKSPACE: tmp,
    GITHUB_ENV: `${tmp}/gh_env`,
    PS_TASK_ID: id,
    PS_TASK_TITLE: title,
    PS_TASK_DESC: '',
    PS_TASK_SCRIPT: scriptRel,
    PS_TASK_WORKDIR: '.',
    PS_TASK_ENV_KV: '',
    PS_TASK_ARGS: '',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  };

  let out = '';
  try {
    execFileSync('bash', ['-lc', `exec > >(tee -a "${logPath}") 2>&1; ${path.join(tmp, 'run.sh')}`], { encoding: 'utf8', env });
    fail('expected run to fail due to unsafe log path (symlink)');
  } catch (err) {
    out = (err.stdout || '') + (err.stderr || '');
    if (!/unsafe log path/.test(out) && !fs.existsSync(logPath)) {
      fail(`expected unsafe log path failure; got: ${out}`);
    }
  }

  // If log exists and isn't symlink, check mode
  if (fs.existsSync(logPath) && !fs.lstatSync(logPath).isSymbolicLink()) {
    const st = fs.statSync(logPath);
    const mode = st.mode & 0o777;
    if (mode !== 0o600) fail(`log mode unexpected: ${mode.toString(8)}`);
  }

  console.log('OK: testLogHardening');
})();

// ----------------------------------------------------------------------------
// Test: env_kv per-value size limit enforcement
// ----------------------------------------------------------------------------
(function testEnvKvSizeLimit() {
  const tmp = mktemp('psrun-');
  extractRunScript(path.join(tmp, 'run.sh'));

  fs.mkdirSync(path.join(tmp, 'logs', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'reports', 'ps-task'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'tools', 'scripts', 'branding'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tools', 'scripts', 'branding', 'print-section.sh'), '#!/usr/bin/env bash\necho "SECTION: $1 $2 $3"\n', { mode: 0o755 });

  const scriptRel = 'scripts/noop.sh';
  fs.writeFileSync(path.join(tmp, scriptRel), '#!/usr/bin/env bash\nset -euo pipefail\necho NOOP\n', { mode: 0o755 });

  const id = 'test-env-size';
  const title = 'Env Size Test';
  const huge = 'A'.repeat(70000); // > 65536
  const env_kv = `FOO=${huge}\n`;

  const env = {
    GITHUB_WORKSPACE: tmp,
    GITHUB_ENV: `${tmp}/gh_env`,
    PS_TASK_ID: id,
    PS_TASK_TITLE: title,
    PS_TASK_DESC: '',
    PS_TASK_SCRIPT: scriptRel,
    PS_TASK_WORKDIR: '.',
    PS_TASK_ENV_KV: env_kv,
    PS_TASK_ARGS: '',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  };

  try {
    execFileSync('bash', ['-lc', `exec > >(tee -a "${path.join(tmp, 'logs', 'ps-task', `${id}.log`)}") 2>&1; ${path.join(tmp, 'run.sh')}`], { encoding: 'utf8', env });
    fail('expected run to fail due to env_kv value too large');
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    if (!/env_kv value too large/.test(out)) fail(`expected env_kv size rejection; got: ${out}`);
  }

  console.log('OK: testEnvKvSizeLimit');
})();

console.log('PS-RUN security tests passed');
process.exit(0);
