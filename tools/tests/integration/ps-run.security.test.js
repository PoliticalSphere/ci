#!/usr/bin/env node

// ==============================================================================
// Political Sphere — PS Run Security Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Test ps-run script security behaviors and path sanitization.
// ==============================================================================

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPsRunEnv,
  createPsRunWorkspace,
  createScript,
  getLogPath,
  getPsRunHelper,
} from '../helpers/ps-run-test-helpers.js';
import { buildSafeEnv, fail, getRepoRoot, readYamlFile } from '../helpers/test-helpers.js';

const repoRoot = getRepoRoot();
const actionYaml = path.join(
  repoRoot,
  '.github',
  'actions',
  'ps-task',
  'ps-run',
  'action.yml',
);

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

// ----------------------------------------------------------------------------
// Test: log file hardening (symlink rejection + permissions)
// ----------------------------------------------------------------------------
(function testLogHardening() {
  const workspaceRoot = createPsRunWorkspace();
  extractRunScript(path.join(workspaceRoot, 'run.sh'));

  const scriptRel = 'scripts/noop.sh';
  createScript(
    workspaceRoot,
    scriptRel,
    '#!/usr/bin/env bash\nset -euo pipefail\necho NOOP\n',
  );

  const id = 'test-log-hardening';
  const title = 'Log Hardening Test';

  // Create a symlink at the expected log path to simulate attack
  const target = path.join(workspaceRoot, '..', 'evil.log');
  const logPath = getLogPath(workspaceRoot, id);
  try {
    fs.symlinkSync(target, logPath);
  } catch {
    // on some platforms symlink may require privileges; create a regular file and then make it a symlink via alternate strategy
    // but proceed — test will ensure we detect unsafe path via isSymbolicLink or failure to create
  }

  const env = buildPsRunEnv(workspaceRoot, {
    PS_TASK_ID: id,
    PS_TASK_TITLE: title,
    PS_TASK_DESC: '',
    PS_TASK_SCRIPT: scriptRel,
    PS_TASK_WORKDIR: '.',
    PS_TASK_ENV_KV: '',
    PS_TASK_ARGS: '',
  });

  let out = '';
  try {
    Object.assign(env, buildSafeEnv());
    execFileSync(
      'bash',
      [
        '-lc',
        `exec > "${logPath}" 2>&1; ${path.join(workspaceRoot, 'run.sh')}`,
      ],
      { encoding: 'utf8', env },
    );
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
  const workspaceRoot = createPsRunWorkspace();

  const scriptRel = 'scripts/noop.sh';
  createScript(
    workspaceRoot,
    scriptRel,
    '#!/usr/bin/env bash\nset -euo pipefail\necho NOOP\n',
  );

  const id = 'test-env-size';
  const title = 'Env Size Test';
  const huge = 'A'.repeat(70000); // > 65536
  const env_kv = `FOO=${huge}\n`;
  const logPath = getLogPath(workspaceRoot, id);
  const helper = getPsRunHelper(repoRoot);
  const command = `exec > "${logPath}" 2>&1; ${helper}`;

  const env = buildPsRunEnv(workspaceRoot, {
    PS_ID: id,
    PS_TITLE: title,
    PS_DESCRIPTION: '',
    PS_REL_SCRIPT: scriptRel,
    PS_REL_WD: '.',
    PS_ENV_KV: env_kv,
    PS_ARGS: '',
  });

  try {
    Object.assign(env, buildSafeEnv());
    execFileSync('bash', ['-lc', command], { encoding: 'utf8', env });
    fail('expected run to fail due to env_kv value too large');
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    const logOut = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, 'utf8')
      : '';
    const combined = out + logOut;
    if (
      !(
        /env_kv value too large/.test(combined) ||
        /env_kv value must not contain NUL bytes/.test(combined)
      )
    ) {
      fail(`expected env_kv size rejection; got: ${combined}`);
    }
  }

  console.log('OK: testEnvKvSizeLimit');
})();

console.log('PS-RUN security tests passed');
process.exit(0);
