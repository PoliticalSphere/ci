#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Naming Checks
// ------------------------------------------------------------------------------
// Purpose:
//   Validate repository naming conventions from configs/ci/policies/naming-policy.json.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import {
  bullet,
  fatal,
  getRepoRoot,
  info,
  isCI,
  section,
} from '../ci/validate-ci/console.js';

const repoRoot = process.env.PS_REPO_ROOT || getRepoRoot();
const policyPath =
  process.env.PS_NAMING_POLICY ||
  path.join(repoRoot, 'configs', 'ci', 'policies', 'naming-policy.json');

section('naming', 'Naming checks starting', `Repo: ${repoRoot}`);

if (!fs.existsSync(policyPath)) {
  fatal(`naming policy not found at ${policyPath}`);
}

const policyRaw = fs.readFileSync(policyPath, 'utf8');
if (!policyRaw.trim()) {
  fatal('naming policy is empty');
}

let policy;
try {
  policy = JSON.parse(policyRaw);
} catch (err) {
  fatal(`naming policy is not valid JSON: ${err.message}`);
}

const rules = policy.rules || {};
const allowlist = policy.allowlist || {};
const disallowedTerms =
  (policy.disallowed_terms?.terms || []).map((t) => t.toLowerCase()) || [];
const typescriptRule = policy.typescript || null;

const workflowRule = rules.workflows;
const actionRule = rules.actions;
const scriptRule = rules.scripts;

const violations = [];

function hasDisallowedTerm(name) {
  if (disallowedTerms.length === 0) return null;
  const base = name.replace(/\.[^.]+$/, '');
  const tokens = base.split(/[^a-z0-9]+/i).filter(Boolean);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (disallowedTerms.includes(lower)) {
      return lower;
    }
  }
  return null;
}

function splitIdentifierTokens(name) {
  const withSpaces = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return withSpaces
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function identifierHasDisallowedTerm(name) {
  if (disallowedTerms.length === 0) return null;
  const tokens = splitIdentifierTokens(name);
  for (const token of tokens) {
    if (disallowedTerms.includes(token)) {
      return token;
    }
  }
  return null;
}

function checkDirExists(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    if (isCI()) {
      fatal(`${label} directory not found at ${dir}`);
    }
    info(`OK (bootstrap): ${label} directory not found at ${dir}`);
    return false;
  }
  return true;
}

function checkWorkflows() {
  if (!workflowRule) return;
  const root = path.join(repoRoot, workflowRule.path);
  section('workflows', 'Workflow naming', workflowRule.description || root);

  if (!checkDirExists(root, 'workflows')) return;

  const pattern = new RegExp(workflowRule.pattern);
  const allow = new Set(allowlist.workflow_files || []);

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) continue;
    if (allow.has(entry.name)) continue;
    if (!pattern.test(entry.name)) {
      violations.push(`workflow: ${path.join(workflowRule.path, entry.name)}`);
      continue;
    }
    const term = hasDisallowedTerm(entry.name);
    if (term) {
      violations.push(
        `workflow: ${path.join(workflowRule.path, entry.name)} (disallowed term: ${term})`,
      );
    }
  }
}

function checkActions() {
  if (!actionRule) return;
  const root = path.join(repoRoot, actionRule.path);
  section('actions', 'Action naming', actionRule.description || root);

  if (!checkDirExists(root, 'actions')) return;

  const pattern = new RegExp(actionRule.pattern);
  const allow = new Set(allowlist.action_dirs || []);

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (allow.has(entry.name)) continue;
    if (!pattern.test(entry.name)) {
      violations.push(`action dir: ${path.join(actionRule.path, entry.name)}`);
      continue;
    }
    const term = hasDisallowedTerm(entry.name);
    if (term) {
      violations.push(
        `action dir: ${path.join(actionRule.path, entry.name)} (disallowed term: ${term})`,
      );
    }
  }
}

function checkScripts() {
  if (!scriptRule) return;
  const root = path.join(repoRoot, scriptRule.path);
  section('scripts', 'Script naming', scriptRule.description || root);

  if (!checkDirExists(root, 'scripts')) return;

  const pattern = new RegExp(scriptRule.pattern);
  const allow = new Set(allowlist.script_files || []);

  const files = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.sh')) {
        files.push(full);
      }
    }
  };

  walk(root);

  for (const file of files) {
    const name = path.basename(file);
    if (allow.has(name)) continue;
    if (!pattern.test(name)) {
      violations.push(`script: ${path.relative(repoRoot, file)}`);
      continue;
    }
    const term = hasDisallowedTerm(name);
    if (term) {
      violations.push(
        `script: ${path.relative(repoRoot, file)} (disallowed term: ${term})`,
      );
    }
  }
}

function checkTypeScriptIdentifiers() {
  if (!typescriptRule) return;
  section(
    'typescript',
    'TypeScript identifier naming',
    typescriptRule.description || 'Disallowed terms in TypeScript identifiers',
  );

  const exclude = new Set(typescriptRule.exclude || []);
  const allowIdentifiers = new Set(allowlist.identifiers || []);
  const files = [];

  const shouldExclude = (filePath) => {
    const parts = filePath.split(path.sep);
    return parts.some((part) => exclude.has(part));
  };

  const walk = (dir) => {
    if (shouldExclude(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.d.ts')
      ) {
        if (!shouldExclude(full)) {
          files.push(full);
        }
      }
    }
  };

  walk(repoRoot);

  const addViolation = (file, name, term) => {
    const rel = path.relative(repoRoot, file);
    violations.push(`ts: ${rel} (${name} contains disallowed term: ${term})`);
  };

  for (const file of files) {
    const sourceText = fs.readFileSync(file, 'utf8');
    if (!sourceText.trim()) continue;
    const scriptKind = file.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const name = node.text;
        if (!allowIdentifiers.has(name)) {
          const term = identifierHasDisallowedTerm(name);
          if (term) {
            addViolation(file, name, term);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
}

checkWorkflows();
checkActions();
checkScripts();
checkTypeScriptIdentifiers();

if (violations.length > 0) {
  section('result', 'Naming checks failed', `${violations.length} issue(s)`);
  for (const v of violations) {
    // CLI utility: print violation entries to stderr intentionally

    bullet(v, { stream: 'stderr' });
  }
  process.exit(1);
}

section('result', 'Naming checks passed', 'All naming rules satisfied');
process.exit(0);
