#!/usr/bin/env node

// ==============================================================================
// Political Sphere — PS Write Summary Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Test ps-write-summary action configuration and behavior.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fail, getRepoRoot, readYamlFile, section } from './test-utils.js';

section(
  'ps-write-summary',
  'PS Write Summary action handles skipped results correctly',
);

const repoRoot = getRepoRoot();
const actionFile = path.join(
  repoRoot,
  '.github',
  'actions',
  'ps-teardown',
  'ps-write-summary',
  'action.yml',
);

if (!fs.existsSync(actionFile)) {
  fail('ps-write-summary action.yml not found');
}

const { doc } = readYamlFile(actionFile);
if (doc.runs.using !== 'composite') {
  fail('ps-write-summary must be a composite action');
}

const steps = doc.runs.steps || [];
const shellStep = steps.find(
  (s) => s.shell === 'bash' && typeof s.run === 'string',
);
if (!shellStep) fail('ps-write-summary must include a bash run step');

const content = shellStep.run;
const scriptMatch = content.match(/ps-write-summary\.sh"$/m);
if (!scriptMatch) fail('ps-write-summary must invoke ps-write-summary.sh');

const scriptPath = path.join(
  repoRoot,
  'tools',
  'scripts',
  'actions',
  'ps-teardown',
  'ps-write-summary',
  'ps-write-summary.sh',
);
if (!fs.existsSync(scriptPath)) fail('ps-write-summary.sh not found');

const scriptContent = fs.readFileSync(scriptPath, 'utf8');
if (!scriptContent.includes('skipped'))
  fail('ps-write-summary must handle skipped values');
if (!scriptContent.includes('overall="skipped"'))
  fail('ps-write-summary must set overall to "skipped" when a job is skipped');

console.log('OK: ps-write-summary handles skipped results appropriately');
process.exit(0);
