#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fail, getRepoRoot, readYamlFile, section } from './test-utils.js';

section('validate-paths', 'Validate Paths action metadata and basic content');

const repoRoot = getRepoRoot();
const actionFile = path.join(repoRoot, '.github', 'actions', 'validate-paths', 'action.yml');

if (!fs.existsSync(actionFile)) {
  fail('validate-paths action.yml not found');
}

const { doc } = readYamlFile(actionFile);

if (doc.runs.using !== 'composite') {
  fail('validate-paths must be a composite action');
}

const inputs = doc.inputs || {};
const wd = inputs['working-directory'];
const script = inputs.script;
if (!wd || !script) {
  fail('validate-paths inputs must include working-directory and script');
}

const steps = doc.runs.steps || [];
if (!Array.isArray(steps) || steps.length === 0) {
  fail('validate-paths must define at least one run step');
}

// Ensure we have a shell run step that contains checks we expect
const shellStep = steps.find((s) => s.shell === 'bash' && typeof s.run === 'string');
if (!shellStep) fail('validate-paths must include a bash run step');

const content = shellStep.run;
if (!content.includes('working-directory') || !content.includes('script')) {
  fail('validate-paths run step must reference working-directory and script');
}
if (!content.includes("must not contain '..'") && !content.includes("must not contain '..':")) {
  // Accept either phrasing
  fail("validate-paths must check for path traversal ( '..' )");
}

console.log('OK: validate-paths action metadata and content looks good');
process.exit(0);