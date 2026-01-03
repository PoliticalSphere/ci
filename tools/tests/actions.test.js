#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Composite Action Tests
// ------------------------------------------------------------------------------
// Purpose:
//   Deterministic contract tests to ensure composite action metadata exists,
//   is parseable, and meets minimum platform standards.
//
// Policy:
//   - In CI: absence of expected actions is a failure.
//   - Locally (bootstrap): missing actions directory or no actions exits cleanly
//     with guidance.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import {
  detail,
  fail,
  getRepoRoot,
  info,
  isCI,
  isObject,
  readYamlFile,
  section,
} from './test-utils.js';

const repoRoot = getRepoRoot();
const actionsRoot = path.join(repoRoot, '.github', 'actions');

section('actions', 'Composite action tests starting', `Root: ${actionsRoot}`);

if (!fs.existsSync(actionsRoot) || !fs.statSync(actionsRoot).isDirectory()) {
  if (isCI()) {
    fail('actions directory not found (expected .github/actions)');
  }
  info('OK (bootstrap): .github/actions directory not found yet.');
  info('HINT: add composite actions under .github/actions/<name>/action.yml');
  process.exit(0);
}

// Collect actions. Support two layouts:
// 1) Top-level action directory with an action.yml present (e.g. `.github/actions/ps-tools/action.yml`)
// 2) Namespace directory containing per-action subdirectories (e.g. `.github/actions/ps-bootstrap/ps-initialize-environment/action.yml`)
const entries = fs.readdirSync(actionsRoot, { withFileTypes: true });
const actionDirs = [];
for (const e of entries) {
  if (!e.isDirectory()) continue;
  const topName = e.name;
  const topPath = path.join(actionsRoot, topName);
  // If the directory itself defines an action, include it as topName
  if (
    fs.existsSync(path.join(topPath, 'action.yml')) ||
    fs.existsSync(path.join(topPath, 'action.yaml'))
  ) {
    actionDirs.push(topName);
    continue;
  }
  // Otherwise, collect immediate subdirectories that define actions and add them as 'topName/subName'
  const sub = fs
    .readdirSync(topPath, { withFileTypes: true })
    .filter((s) => s.isDirectory())
    .map((s) => s.name);
  for (const subName of sub) {
    const subPath = path.join(topPath, subName);
    if (
      fs.existsSync(path.join(subPath, 'action.yml')) ||
      fs.existsSync(path.join(subPath, 'action.yaml'))
    ) {
      actionDirs.push(`${topName}/${subName}`);
    }
  }
}

if (actionDirs.length === 0) {
  if (isCI()) {
    fail(
      'no composite actions found in .github/actions (CI requires at least one)',
    );
  }
  info('OK (bootstrap): no composite actions found yet.');
  info(
    'HINT: add composite actions under .github/actions/<name>/action.yml or nested under `.github/actions/<namespace>/<action>/action.yml`',
  );
  process.exit(0);
}

let checked = 0;

function extractCatalogActions(readmeText) {
  const start = readmeText.indexOf('## Action Catalog');
  if (start === -1) return new Set();
  const rest = readmeText.slice(start);
  const nextHeader = rest.slice(2).search(/^##\s/m);
  const section =
    nextHeader === -1 ? rest : rest.slice(0, Math.max(0, nextHeader + 2));

  const set = new Set();
  const lines = section.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/- `([^`]+)`/);
    if (match) set.add(match[1]);
  }
  return set;
}

const readmePath = path.join(actionsRoot, 'README.md');
if (!fs.existsSync(readmePath)) {
  fail('actions README missing at .github/actions/README.md');
}

const readmeText = fs.readFileSync(readmePath, 'utf8');
const catalog = extractCatalogActions(readmeText);
if (catalog.size === 0) {
  fail('actions README Action Catalog is missing or empty');
}

actionDirs.sort();
const actionDirSet = new Set(actionDirs);
const topLevelDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
const topLevelSet = new Set(topLevelDirs);

// An action is considered present in the catalog if either the full name (e.g. 'ps-bootstrap/ps-initialize-environment')
// is listed, or the top-level namespace is listed (e.g. 'ps-bootstrap').
const missingInCatalog = actionDirs.filter((d) => {
  const top = d.includes('/') ? d.split('/')[0] : d;
  return !(catalog.has(d) || catalog.has(top));
});

// Catalog entries are allowed if they are either a validated action (full name) or a top-level namespace.
const extraInCatalog = [...catalog].filter((d) => {
  return !(actionDirSet.has(d) || topLevelSet.has(d));
});

if (missingInCatalog.length > 0) {
  fail(`actions missing from catalog: ${missingInCatalog.join(', ')}`);
}

if (extraInCatalog.length > 0) {
  fail(`catalog lists non-existent actions: ${extraInCatalog.join(', ')}`);
}

section('action', 'Checking actions', `${actionDirs.length} action(s)`);

for (const dir of actionDirs) {
  const yml = path.join(actionsRoot, dir, 'action.yml');
  const yaml = path.join(actionsRoot, dir, 'action.yaml');

  // Determine which action file to use (prefer .yml over .yaml)
  let actionFile = null;
  if (fs.existsSync(yml)) {
    actionFile = yml;
  } else if (fs.existsSync(yaml)) {
    actionFile = yaml;
  }
  if (!actionFile) {
    fail(`missing action.yml or action.yaml in .github/actions/${dir}`);
  }

  const { doc } = readYamlFile(actionFile);

  // Minimal schema validation
  if (!isObject(doc))
    fail(`action metadata must be a YAML mapping: ${actionFile}`);

  if (typeof doc.name !== 'string' || !doc.name.trim()) {
    fail(`missing/invalid 'name' in ${path.relative(repoRoot, actionFile)}`);
  }
  if (typeof doc.description !== 'string' || !doc.description.trim()) {
    fail(
      `missing/invalid 'description' in ${path.relative(repoRoot, actionFile)}`,
    );
  }

  if (!isObject(doc.runs) || typeof doc.runs.using !== 'string') {
    fail(
      `missing/invalid 'runs.using' in ${path.relative(repoRoot, actionFile)}`,
    );
  }
  if (doc.runs.using !== 'composite') {
    fail(
      `'runs.using' must be 'composite' in ${path.relative(repoRoot, actionFile)} (got '${doc.runs.using}')`,
    );
  }
  if (!Array.isArray(doc.runs.steps) || doc.runs.steps.length === 0) {
    fail(
      `missing/invalid 'runs.steps' in ${path.relative(repoRoot, actionFile)}`,
    );
  }

  // Inputs/outputs validation
  const inputs = doc.inputs;
  if (inputs !== undefined) {
    if (!isObject(inputs))
      fail(
        `'inputs' must be a mapping in ${path.relative(repoRoot, actionFile)}`,
      );
    for (const [name, meta] of Object.entries(inputs)) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        fail(
          `invalid input name '${name}' in ${path.relative(repoRoot, actionFile)}`,
        );
      }
      if (
        !isObject(meta) ||
        typeof meta.description !== 'string' ||
        !meta.description.trim()
      ) {
        fail(
          `input '${name}' missing description in ${path.relative(repoRoot, actionFile)}`,
        );
      }
    }
  }

  const outputs = doc.outputs;
  if (outputs !== undefined) {
    if (!isObject(outputs))
      fail(
        `'outputs' must be a mapping in ${path.relative(repoRoot, actionFile)}`,
      );
    for (const [name, meta] of Object.entries(outputs)) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        fail(
          `invalid output name '${name}' in ${path.relative(repoRoot, actionFile)}`,
        );
      }
      if (
        !isObject(meta) ||
        typeof meta.description !== 'string' ||
        !meta.description.trim()
      ) {
        fail(
          `output '${name}' missing description in ${path.relative(repoRoot, actionFile)}`,
        );
      }
    }
  }

  checked += 1;
  detail(`${dir}: ok`);
}

section(
  'result',
  'Composite action tests passed',
  `${checked} action(s) validated`,
);
info(
  `OK: ${checked} composite action(s) found and have valid composite metadata`,
);
process.exit(0);
