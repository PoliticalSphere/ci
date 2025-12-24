#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fail, section } from './test-utils.js';

section('workflows', 'Workflow uses validate-paths guard');

const wf = path.join(process.cwd(), '.github', 'workflows', 'build-artifacts.yml');
if (!fs.existsSync(wf)) {
  fail('build-artifacts workflow not found');
}

const text = fs.readFileSync(wf, 'utf8');
if (!text.includes('uses: ./.github/actions/validate-paths')) {
  fail('build-artifacts.yml should use validate-paths for input validation');
}

console.log('OK: build-artifacts.yml calls validate-paths');
process.exit(0);