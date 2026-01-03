#!/usr/bin/env node

// ==============================================================================
// Political Sphere - Consumer Contract Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Verify the consumer contract checker against synthetic fixtures.
// ==============================================================================

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detail, fail, SAFE_PATH, section } from './test-utils.js';

const repoRoot = (() => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(path.join(__dirname, '..', '..'));
})();

const contractScript = path.join(
  repoRoot,
  'tools',
  'scripts',
  'consumer',
  'contract-check.js',
);

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

section('contract', 'Consumer contract tests', 'Synthetic fixtures');

const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
detail(`Workspace: ${workspaceRoot}`);

const policyPath = path.join(
  workspaceRoot,
  'configs',
  'consumer',
  'contract.json',
);
const exceptionsPath = path.join(
  workspaceRoot,
  'configs',
  'consumer',
  'exceptions.json',
);
const reportPath = path.join(
  workspaceRoot,
  'reports',
  'contracts',
  'contract.json',
);
const summaryPath = path.join(
  workspaceRoot,
  'reports',
  'contracts',
  'contract.txt',
);

function buildContractEnv(root) {
  return {
    ...process.env,
    PATH: `${SAFE_PATH}:${path.dirname(process.execPath)}`,
    CI: '1',
    FORCE_COLOR: '1',
    PS_REPO_ROOT: root,
    PS_CONTRACT_REPO_ROOT: root,
  };
}

writeFile(
  path.join(workspaceRoot, 'package.json'),
  JSON.stringify(
    {
      name: 'consumer-fixture',
      private: true,
      scripts: {
        lint: 'echo lint',
        typecheck: 'echo typecheck',
        test: 'echo test',
        build: 'echo build',
      },
      devDependencies: {
        typescript: '5.6.3',
      },
    },
    null,
    2,
  ),
);

writeFile(
  path.join(workspaceRoot, 'package-lock.json'),
  JSON.stringify({ packages: {} }, null, 2),
);
writeFile(
  path.join(workspaceRoot, 'tsconfig.json'),
  JSON.stringify({ compilerOptions: {} }, null, 2),
);

writeFile(
  path.join(workspaceRoot, '.github', 'workflows', 'pr-gates.yml'),
  [
    'name: PR Gates',
    'on: [pull_request]',
    'permissions: {}',
    'jobs:',
    '  pr-gates:',
    '    uses: PoliticalSphere/ci/.github/workflows/pr-gates.yml@v1',
    '    permissions:',
    '      contents: read',
    '',
  ].join('\n'),
);

writeFile(
  policyPath,
  JSON.stringify(
    {
      policy: {
        mode: 'enforce',
        required_files: ['package.json', 'package-lock.json', 'tsconfig.json'],
        required_scripts: {
          lint: ['lint'],
          typecheck: ['typecheck'],
          test: ['test'],
          build: ['build'],
        },
        tooling: { require: ['typescript'], disallow: [] },
        workflows: {
          required_reusable: [
            'PoliticalSphere/ci/.github/workflows/pr-gates.yml',
          ],
          allowed_top_level: ['pr-gates.yml'],
        },
        path_integrity: { enabled: false },
      },
    },
    null,
    2,
  ),
);

writeFile(
  exceptionsPath,
  JSON.stringify(
    {
      exceptions: {
        files: { allow_missing: [], allow_present: [] },
        scripts: { allow_missing: [] },
        tools: { allow_missing: [], allow_present: [] },
        workflows: { allow_missing_uses: [], allow_top_level: [] },
        imports: { allow_unresolved: [] },
      },
    },
    null,
    2,
  ),
);

// PASS case
try {
  execFileSync(
    process.execPath,
    [
      contractScript,
      '--policy',
      policyPath,
      '--exceptions',
      exceptionsPath,
      '--report',
      reportPath,
      '--summary',
      summaryPath,
    ],
    {
      cwd: workspaceRoot,
      env: buildContractEnv(workspaceRoot),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
} catch (err) {
  console.error(
    'consumer contract pass case failed:',
    err?.stdout || err?.stderr || String(err),
  );
  fail('consumer contract pass case failed unexpectedly');
}

// FAIL case (missing script)
const brokenPackage = JSON.parse(
  fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
);
delete brokenPackage.scripts.test;
writeFile(
  path.join(workspaceRoot, 'package.json'),
  JSON.stringify(brokenPackage, null, 2),
);

let failed = false;
try {
  execFileSync(
    process.execPath,
    [contractScript, '--policy', policyPath, '--exceptions', exceptionsPath],
    {
      cwd: workspaceRoot,
      env: buildContractEnv(workspaceRoot),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
} catch (err) {
  console.error(
    'consumer contract fail case errored as expected:',
    err?.stdout || err?.stderr || String(err),
  );
  failed = true;
}

if (!failed) {
  fail('consumer contract fail case did not fail as expected');
}

detail('OK: consumer contract fixtures behaved as expected');
