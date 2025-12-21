#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Validate-CI
// ------------------------------------------------------------------------------
// Purpose:
//   Enforce CI policy rules defined in configs/ci/policies/validate-ci.yml.
//
// Design:
//   - Deterministic, non-interactive
//   - Linear control flow for AI readability
//   - Structured output (sectioned, actionable errors)
//   - Exit codes are meaningful (0 pass, 1 fail)
// ==============================================================================

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { scanActions, scanWorkflows } from './checks.js';
import { bullet, detail, fatal, section } from './console.js';
import { getRepoRoot, isCI } from './env.js';
import { listActionMetadata, listWorkflows, loadText } from './fs.js';
import {
  loadAllowlist,
  loadArtifactPolicy,
  loadHighRiskTriggers,
  loadInlineAllowlist,
  loadInlineConstraints,
  loadPermissionsBaseline,
  loadUnsafeAllowlist,
  loadUnsafePatterns,
} from './policies.js';

const workspaceRoot = getRepoRoot();
const platformRoot = process.env.PS_PLATFORM_ROOT || workspaceRoot;
const configPath =
  process.env.PS_VALIDATE_CI_CONFIG ||
  path.join(platformRoot, 'configs/ci/policies/validate-ci.yml');

section('validate-ci', 'Validate-CI starting', `Workspace: ${workspaceRoot}`);
detail(`Platform root: ${platformRoot}`);

if (!fs.existsSync(configPath)) {
  fatal(`validate-ci config not found at ${configPath}`);
}

section(
  'config',
  'Loading config',
  `Path: ${path.relative(platformRoot, configPath)}`,
);
const raw = loadText(configPath);

// Basic sanity checks to avoid "exists but empty/garbage" configs.
if (!raw.trim()) {
  fatal('validate-ci config is empty');
}

let config;
try {
  config = yaml.parse(raw);
} catch (err) {
  fatal(`validate-ci config is not valid YAML: ${err.message}`);
}
if (!config || typeof config !== 'object') {
  fatal('validate-ci config is not a valid YAML object');
}
if (!config.rules || typeof config.rules !== 'object') {
  fatal("validate-ci config appears invalid (missing 'rules' key)");
}

detail('Status: configuration loaded and passed basic sanity checks.');

const inlineMaxLines = Number(
  config.rules?.inline_bash?.max_inline_lines ?? 15,
);
const requireSectionHeaders =
  config.rules?.outputs_and_artifacts?.require_section_headers === true;
const allowedFirstSteps =
  config.rules?.runner_hardening?.allowed_first_steps || [];
const scoreFailThreshold =
  typeof config.enforcement?.score_fail_threshold === 'number'
    ? config.enforcement.score_fail_threshold
    : null;
const verifyRemoteShas =
  String(process.env.PS_VALIDATE_CI_VERIFY_REMOTE || '0') === '1';
const quiet =
  String(process.env.PS_VALIDATE_CI_QUIET || '0') === '1' ||
  String(process.env.PS_VALIDATE_CI_QUIET || '0') === 'true';

const remoteShaCache = new Map();

function validateRemoteAction(action, ref) {
  if (!verifyRemoteShas) return true;
  if (!action || !ref) return true;
  if (!/^[a-f0-9]{40}$/.test(ref)) return true;

  const parts = action.split('/');
  const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : action;
  const key = `${repo}@${ref}`;

  if (remoteShaCache.has(key)) {
    return remoteShaCache.get(key);
  }

  let ok = false;
  let error = null;
  try {
    const out = execSync(`git ls-remote https://github.com/${repo}.git`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 10000,
    });
    ok = out
      .split(/\r?\n/)
      .some((line) => line.startsWith(`${ref}\t`));
  } catch {
    ok = false;
    error = 'remote_unreachable';
  }

  const result = { ok, error };
  remoteShaCache.set(key, result);
  return result;
}

function assertConfigFile(filePath, label, checks) {
  const text = loadText(filePath);
  if (!text.trim()) {
    fatal(`${label} config is empty: ${filePath}`);
  }
  let parsed;
  try {
    parsed = yaml.parse(text);
  } catch (err) {
    fatal(`${label} config is not valid YAML: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    fatal(`${label} config is not a valid YAML object: ${filePath}`);
  }
  for (const check of checks) {
    if (check.anyOf) {
      const ok = check.anyOf.some((option) =>
        Object.hasOwn(parsed, option.key),
      );
      if (!ok) {
        const names = check.anyOf
          .map((option) => `'${option.key}'`)
          .join(' or ');
        fatal(`${label} config missing ${names} key: ${filePath}`);
      }
      continue;
    }
    if (!Object.hasOwn(parsed, check.key)) {
      fatal(`${label} config missing '${check.key}' key: ${filePath}`);
    }
  }
}

const allowlistPath = path.join(
  platformRoot,
  'configs/ci/exceptions/actions-allowlist.yml',
);
const unsafePatternsPath = path.join(
  platformRoot,
  'configs/ci/policies/unsafe-patterns.yml',
);
const unsafeAllowlistPath = path.join(
  platformRoot,
  'configs/ci/exceptions/unsafe-patterns-allowlist.yml',
);
const inlineAllowlistPath = path.join(
  platformRoot,
  'configs/ci/exceptions/inline-bash-allowlist.yml',
);
const highRiskAllowlistPath = path.join(
  platformRoot,
  'configs/ci/exceptions/high-risk-triggers-allowlist.yml',
);
const permissionsBaselinePath = path.join(
  platformRoot,
  'configs/ci/policies/permissions-baseline.yml',
);
const artifactPolicyPath = path.join(
  platformRoot,
  'configs/ci/policies/artifact-policy.yml',
);

assertConfigFile(allowlistPath, 'Actions allowlist', [{ key: 'allowlist' }]);
assertConfigFile(unsafePatternsPath, 'Unsafe patterns', [{ key: 'patterns' }]);
assertConfigFile(unsafeAllowlistPath, 'Unsafe patterns allowlist', [
  { key: 'allowlist' },
]);
assertConfigFile(inlineAllowlistPath, 'Inline bash allowlist', [
  { key: 'allowlist' },
  { key: 'constraints' },
]);
assertConfigFile(highRiskAllowlistPath, 'High-risk triggers allowlist', [
  { key: 'high_risk_triggers' },
  { key: 'allowlist' },
]);
assertConfigFile(permissionsBaselinePath, 'Permissions baseline', [
  {
    anyOf: [{ key: 'defaults' }, { key: 'policy' }],
  },
  { key: 'workflows' },
]);
assertConfigFile(artifactPolicyPath, 'Artifact policy', [{ key: 'allowlist' }]);
{
  const artifactText = loadText(artifactPolicyPath);
  const artifactDoc = yaml.parse(artifactText);
  const requiredPaths =
    artifactDoc?.required_paths || artifactDoc?.policy?.required_paths;
  if (!Array.isArray(requiredPaths)) {
    fatal(
      `Artifact policy config missing 'required_paths' (at root or policy): ${artifactPolicyPath}`,
    );
  }
}

const allowedActions = loadAllowlist(allowlistPath);
const unsafePatterns = loadUnsafePatterns(unsafePatternsPath);
const unsafeAllowlist = loadUnsafeAllowlist(unsafeAllowlistPath);
const inlineAllowlist = loadInlineAllowlist(inlineAllowlistPath);
const inlineConstraints = loadInlineConstraints(inlineAllowlistPath);
const highRisk = loadHighRiskTriggers(highRiskAllowlistPath);
const permissionsBaseline = loadPermissionsBaseline(permissionsBaselinePath);
const artifactPolicy = loadArtifactPolicy(artifactPolicyPath);

const workflows = listWorkflows(workspaceRoot);
if (workflows.length === 0) {
  if (isCI()) {
    fatal('no workflows found under .github/workflows');
  }
  detail('Bootstrap: no workflows found under .github/workflows');
}
const actions = listActionMetadata(platformRoot);
if (quiet) {
  detail(
    `Scanning: ${workflows.length} workflow(s) and ${actions.length} action(s).`,
  );
}

const violations = [];

violations.push(
  ...scanWorkflows({
    workflows,
    workspaceRoot,
    allowedActions,
    unsafePatterns,
    unsafeAllowlist,
    inlineAllowlist,
    inlineConstraints,
    inlineMaxLines,
    highRisk,
    permissionsBaseline,
    artifactPolicy,
    validateRemoteAction,
    requireSectionHeaders,
    allowedFirstSteps,
    quiet,
  }),
);

violations.push(
  ...scanActions({
    actions,
    platformRoot,
    allowedActions,
    validateRemoteAction,
    quiet,
  }),
);

{
  const totalWeight = violations.reduce((s, v) => s + (v.weight || 1), 0);
  const deductionPercent = Math.min(100, totalWeight * 10);
  const score = Math.max(0, 100 - deductionPercent);

  const failedByScore =
    scoreFailThreshold !== null && score < scoreFailThreshold;

  const reportPath =
    process.env.PS_VALIDATE_CI_REPORT ||
    path.join(workspaceRoot, 'reports', 'validate-ci', 'validate-ci.json');
  const reportDir = path.dirname(reportPath);
  try {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          score,
          deductionPercent,
          totalWeight,
          threshold: scoreFailThreshold,
          violations,
        },
        null,
        2,
      )}\n`,
    );
  } catch {
    // Non-fatal: reporting should not block validation.
  }

  if (violations.length > 0 || failedByScore) {
    section('result', 'Validate-CI failed', `${violations.length} issue(s)`);
    for (const v of violations) {
      // This is a CLI tool: print structured errors to stderr for human and
      // machine consumption.

      if (v?.path && v.message) {
        const loc = v.line
          ? `${v.path}:${v.line}${v.column ? `:${v.column}` : ''}`
          : v.path;
        bullet(`${loc} - ${v.message} (weight=${v.weight || 1})`, {
          stream: 'stderr',
        });
      } else {
        bullet(String(v), { stream: 'stderr' });
      }
    }

    // Print score summary (CLI output)

    bullet(
      `Score: ${score}% (deduction ${deductionPercent}% from total weight ${totalWeight})`,
      { stream: 'stderr' },
    );
    if (scoreFailThreshold !== null) {
      bullet(
        `Configured failure threshold: ${scoreFailThreshold}%. ${failedByScore ? 'Below threshold -> failing.' : 'Above threshold -> OK by score.'}`,
        { stream: 'stderr' },
      );
    }

    process.exit(1);
  }
}

{
  const totalWeight = violations.reduce((s, v) => s + (v.weight || 1), 0);
  const deductionPercent = Math.min(100, totalWeight * 10);
  const score = Math.max(0, 100 - deductionPercent);

  detail(
    `Score: ${score}% (deduction ${deductionPercent}% from total weight ${totalWeight})`,
  );
  if (scoreFailThreshold !== null) {
    detail(
      `Configured failure threshold: ${scoreFailThreshold}%. Above threshold -> OK by score.`,
    );
  }
}

section('result', 'Validate-CI passed', 'Policy checks satisfied');
process.exit(0);
