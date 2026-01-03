#!/usr/bin/env node

// ======================================================================
// Political Sphere — Validate-CI
// ----------------------------------------------------------------------
// Purpose:
//   Enforce CI policy rules defined in configs/ci/policies/validate-ci.yml.
//
// Design:
//   - Deterministic, non-interactive
//   - Linear control flow for AI readability
//   - Structured output (sectioned, actionable errors)
//   - Exit codes are meaningful (0 pass, 1 fail)
// ======================================================================

import fs from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { scanActions, scanWorkflows } from './checks.js';
import { bullet, detail, fatal, record, section } from './console.js';
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
import {
  classifyRemoteVerifyResult,
  createRemoteVerifier,
} from './remote-verify.js';
import { getSafePathEnv } from './safe-path.js';

const SCORE_MAX = 100;
const SCORE_DEDUCTION_PER_WEIGHT = 10;

process.env.PS_LOG_COMPONENT = process.env.PS_LOG_COMPONENT || 'validate-ci';

let workspaceRoot = '';
try {
  workspaceRoot = getRepoRoot();
} catch (err) {
  fatal(err?.message || err);
}
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

function loadRuleConfig(ruleName, rule) {
  if (!rule || typeof rule !== 'object') return rule;
  if (!rule.config_file || typeof rule.config_file !== 'string') return rule;
  const configFile = path.isAbsolute(rule.config_file)
    ? rule.config_file
    : path.join(platformRoot, rule.config_file);
  const ruleText = loadText(configFile);
  if (!ruleText.trim()) {
    fatal(`rule config for '${ruleName}' is empty: ${rule.config_file}`);
  }
  let parsed;
  try {
    parsed = yaml.parse(ruleText);
  } catch (err) {
    fatal(
      `rule config for '${ruleName}' is not valid YAML (${rule.config_file}): ${err.message}`,
    );
  }
  const ruleConfig = parsed?.rule;
  if (!ruleConfig || typeof ruleConfig !== 'object') {
    return rule;
  }
  return { ...ruleConfig, ...rule };
}

const mergedRules = {};
for (const [ruleName, rule] of Object.entries(config.rules)) {
  mergedRules[ruleName] = loadRuleConfig(ruleName, rule);
}
config.rules = mergedRules;

const inlineMaxLines = Number(
  config.rules?.inline_bash?.max_inline_lines ?? 15,
);
const requireSectionHeaders =
  config.rules?.outputs_and_artifacts?.require_section_headers === true;
const allowedFirstSteps =
  config.rules?.runner_hardening?.allowed_first_steps || [];
const hardenRunnerActionAllowlist =
  config.rules?.runner_hardening?.harden_runner_action_allowlist || [];
const localActions = config.rules?.local_actions || {};
const scoreFailThreshold =
  typeof config.enforcement?.score_fail_threshold === 'number'
    ? config.enforcement.score_fail_threshold
    : null;
const verifyRemoteEnv = String(
  process.env.PS_VALIDATE_CI_VERIFY_REMOTE || '',
).toLowerCase();
const verifyRemoteFromEnv =
  verifyRemoteEnv === '' ? null : !['0', 'false'].includes(verifyRemoteEnv);
const verifyRemoteFromConfig = config.rules?.remote_sha_verify?.enabled ?? true;
const verifyRemoteShas =
  verifyRemoteFromEnv === null ? verifyRemoteFromConfig : verifyRemoteFromEnv;
detail(
  `Remote SHA verification: ${
    verifyRemoteShas ? 'ENABLED' : 'DISABLED'
  } (PS_VALIDATE_CI_VERIFY_REMOTE=${
    process.env.PS_VALIDATE_CI_VERIFY_REMOTE || '<unset>'
  })`,
);
const quiet =
  String(process.env.PS_VALIDATE_CI_QUIET || '0') === '1' ||
  String(process.env.PS_VALIDATE_CI_QUIET || '0') === 'true';

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
  for (const requiredCheck of checks) {
    if (requiredCheck.anyOf) {
      const ok = requiredCheck.anyOf.some((requiredKey) =>
        Object.hasOwn(parsed, requiredKey.key),
      );
      if (!ok) {
        const names = requiredCheck.anyOf
          .map((requiredKey) => `'${requiredKey.key}'`)
          .join(' or ');
        fatal(`${label} config missing ${names} key: ${filePath}`);
      }
      continue;
    }
    if (!Object.hasOwn(parsed, requiredCheck.key)) {
      fatal(`${label} config missing '${requiredCheck.key}' key: ${filePath}`);
    }
  }
}

const allowlistPath = path.join(
  platformRoot,
  'configs/ci/policies/allowed-actions.yml',
);
const unsafePatternsPath = path.join(
  platformRoot,
  'configs/ci/policies/unsafe-patterns.yml',
);
const unsafeAllowlistPath = path.join(
  platformRoot,
  'configs/ci/policies/unsafe-patterns-allowlist.yml',
);
const inlineAllowlistPath = path.join(
  platformRoot,
  'configs/ci/policies/inline-bash.yml',
);
const highRiskAllowlistPath = path.join(
  platformRoot,
  'configs/ci/policies/high-risk-triggers.yml',
);
const permissionsBaselinePath = path.join(
  platformRoot,
  'configs/ci/policies/permissions-baseline.yml',
);
const egressAllowlistPath = path.join(
  platformRoot,
  'configs/ci/policies/egress-allowlist.yml',
);
const artifactPolicyPath = path.join(
  platformRoot,
  'configs/ci/policies/artifact-policy.yml',
);
const actionPinningPath = path.join(
  platformRoot,
  'configs/ci/policies/action-pinning.yml',
);
const remoteShaVerifyPath = path.join(
  platformRoot,
  'configs/ci/policies/remote-sha-verify.yml',
);

assertConfigFile(egressAllowlistPath, 'Egress allowlist', [
  { key: 'allowlist' },
]);
const egressAllowlistDoc = yaml.parse(loadText(egressAllowlistPath));
const egressAllowlist = Array.isArray(egressAllowlistDoc?.allowlist)
  ? egressAllowlistDoc.allowlist
  : [];
if (egressAllowlist.length === 0) {
  fatal(`egress allowlist is empty: ${egressAllowlistPath}`);
}

function createTrackedRemoteVerifier(baseValidateRemoteAction) {
  const stats = { rateLimitedSoft: 0 };
  const validateRemoteAction = async (...args) => {
    const result = await baseValidateRemoteAction(...args);
    const info = classifyRemoteVerifyResult(result);
    if (info.isSoftRateLimit) {
      stats.rateLimitedSoft += 1;
    }
    return result;
  };
  return { validateRemoteAction, stats };
}

const baseValidateRemoteAction = createRemoteVerifier({
  verifyRemoteShas,
  allowedHosts: egressAllowlist,
});
const { validateRemoteAction, stats: remoteVerifyStats } =
  createTrackedRemoteVerifier(baseValidateRemoteAction);

const hardenRunnerPath = path.join(
  platformRoot,
  'configs/ci/policies/harden-runner.yml',
);
const inlineBashPath = path.join(
  platformRoot,
  'configs/ci/policies/inline-bash.yml',
);
const secretsHandlingPath = path.join(
  platformRoot,
  'configs/ci/policies/secrets-handling.yml',
);
const localActionsPath = path.join(
  platformRoot,
  'configs/ci/policies/local-actions.yml',
);
const sectionHeadersPath = path.join(
  platformRoot,
  'configs/ci/policies/section-headers.yml',
);

assertConfigFile(allowlistPath, 'Actions allowlist', [{ key: 'allowlist' }]);
assertConfigFile(actionPinningPath, 'Action pinning policy', [{ key: 'rule' }]);
assertConfigFile(remoteShaVerifyPath, 'Remote SHA verify policy', [
  { key: 'rule' },
]);
assertConfigFile(hardenRunnerPath, 'Harden runner policy', [{ key: 'rule' }]);
assertConfigFile(inlineBashPath, 'Inline bash policy', [
  { key: 'rule' },
  { key: 'allowlist' },
  { key: 'constraints' },
]);
assertConfigFile(secretsHandlingPath, 'Secrets handling policy', [
  { key: 'rule' },
]);
assertConfigFile(localActionsPath, 'Local actions policy', [{ key: 'rule' }]);
assertConfigFile(sectionHeadersPath, 'Section headers policy', [
  { key: 'rule' },
]);
assertConfigFile(unsafePatternsPath, 'Unsafe patterns', [{ key: 'patterns' }]);
assertConfigFile(unsafeAllowlistPath, 'Unsafe patterns allowlist', [
  { key: 'allowlist' },
]);
assertConfigFile(highRiskAllowlistPath, 'High-risk triggers policy', [
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

import { spawnSync } from 'node:child_process';

let SAFE_PATH = '';
try {
  SAFE_PATH = getSafePathEnv();
} catch (err) {
  fatal(`Safe PATH validation failed: ${err?.message || err}`);
}

function extractHostFromUrl(url) {
  if (!url) return '';
  if (url.includes('://')) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }
  const sshMatch = url.match(/^[^@]+@([^:]+):/);
  if (sshMatch) return sshMatch[1];
  const host = url.split('/')[0] || '';
  return host.split(':')[0];
}

function assertEgressAllowedHost(host) {
  if (!host) {
    fatal('egress host is empty');
  }
  if (!egressAllowlist.includes(host)) {
    fatal(`egress host not allowlisted: ${host}`);
  }
}

function assertEgressAllowedGitRemote(remote = 'origin') {
  const r = spawnSync('git', ['remote', 'get-url', remote], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    env: { PATH: SAFE_PATH },
  });
  const url = r && r.status === 0 ? String(r.stdout || '').trim() : '';
  if (!url) {
    fatal(`git remote ${remote} is not configured`);
  }
  assertEgressAllowedHost(extractHostFromUrl(url));
}

function tryGit(args) {
  const parts = String(args).split(/\s+/).filter(Boolean);
  if (!SAFE_PATH) {
    fatal('Safe PATH not initialized; refusing to spawn git');
  }
  const r = spawnSync('git', parts, {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    env: { PATH: SAFE_PATH },
  });
  if (r && r.status === 0) return String(r.stdout || '').trim();
  return '';
}

function ensureCommit(sha) {
  if (!sha) return false;
  if (tryGit(`cat-file -e ${sha}^{commit}`)) return true;
  assertEgressAllowedGitRemote();
  tryGit(`fetch --no-tags --depth=1 origin ${sha}`);
  return Boolean(tryGit(`cat-file -e ${sha}^{commit}`));
}

let workflows = listWorkflows(workspaceRoot);
if (workflows.length === 0) {
  if (isCI()) {
    fatal('no workflows found under .github/workflows');
  }
  detail('Bootstrap: no workflows found under .github/workflows');
}
let actions = listActionMetadata(platformRoot);
if (quiet) {
  detail(
    `Scanning: ${workflows.length} workflow(s) and ${actions.length} action(s).`,
  );
}

const prOnly =
  String(process.env.PS_VALIDATE_CI_PR_ONLY || '0') === '1' ||
  String(process.env.PS_VALIDATE_CI_PR_ONLY || '0') === 'true';
const prBase = process.env.PS_PR_BASE_SHA || '';
const prHead = process.env.PS_PR_HEAD_SHA || '';

// PR-only mode reduces runtime in large repos; full scan remains the default.
if (prOnly) {
  detail('PR-only mode: limiting validation to changed workflows/actions.');
  if (prBase && prHead) {
    const baseOk = ensureCommit(prBase);
    const headOk = ensureCommit(prHead);
    if (baseOk && headOk) {
      const diff = tryGit(`diff --name-only ${prBase} ${prHead}`);
      const changedRel = diff
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !path.isAbsolute(p));
      const changedWorkspace = new Set(
        changedRel.map((p) => path.resolve(workspaceRoot, p)),
      );
      const changedPlatform = new Set(
        changedRel.map((p) => path.resolve(platformRoot, p)),
      );
      workflows = workflows.filter((wf) => changedWorkspace.has(wf));
      actions = actions.filter((action) => changedPlatform.has(action));
      detail(
        `PR-only mode: ${workflows.length} workflow(s), ${actions.length} action(s) changed.`,
      );
    } else {
      detail(
        'PR-only mode: unable to resolve PR base/head SHAs; falling back to full scan.',
      );
    }
  } else {
    detail(
      'PR-only mode: missing PR base/head SHAs; falling back to full scan.',
    );
  }
}

const violations = [];
let warnings = [];

const workflowResult = await scanWorkflows({
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
  hardenRunnerActionAllowlist,
  localActions,
  quiet,
});
const workflowViolations = workflowResult.violations;
const actionViolations = await scanActions({
  actions,
  platformRoot,
  allowedActions,
  validateRemoteAction,
  quiet,
});
violations.push(...workflowViolations, ...actionViolations);

{
  const totalWeight = violations.reduce((s, v) => s + (v.weight || 1), 0);
  const deductionPercent = Math.min(
    SCORE_MAX,
    totalWeight * SCORE_DEDUCTION_PER_WEIGHT,
  );
  const score = Math.max(0, SCORE_MAX - deductionPercent);

  const failedByScore =
    scoreFailThreshold !== null && score < scoreFailThreshold;

  warnings = [];
  if (workflowResult.warnings?.length) {
    warnings.push(
      ...workflowResult.warnings.map((w) => ({
        code: w.code || 'PARSE_WARNING',
        message: w.message,
        workflow: w.workflow,
      })),
    );
  }
  if (remoteVerifyStats.rateLimitedSoft > 0) {
    const message = `Remote SHA verification skipped for ${remoteVerifyStats.rateLimitedSoft} action(s) due to GitHub API rate limits.`;
    warnings.push({
      code: 'RATE_LIMIT_SOFT',
      message,
      count: remoteVerifyStats.rateLimitedSoft,
    });
    detail(`WARN: ${message}`);
  }
  for (const w of warnings) {
    record('warn', 'validate-ci.warning', {
      code: w.code,
      message: w.message,
      workflow: w.workflow,
      count: w.count,
    });
  }

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
          warnings,
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
    record('error', 'validate-ci.result', {
      status: 'FAIL',
      violations: violations.length,
      warnings: warnings.length,
      score,
      deduction: deductionPercent,
      threshold: scoreFailThreshold,
      failed_by_score: failedByScore,
    });
    section('result', 'Validate-CI failed', `${violations.length} issue(s)`);
    for (const v of violations) {
      // This is a CLI tool: print structured errors to stderr for human and
      // machine consumption.

      record('error', 'validate-ci.violation', {
        code: v.code,
        message: v.message,
        path: v.path,
        line: v.line,
        column: v.column,
        weight: v.weight,
        workflow: v.workflow,
        job: v.job,
        action: v.action,
        ref: v.ref,
      });

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
      const thresholdMessage = failedByScore
        ? 'Below threshold -> failing.'
        : 'Above threshold -> OK by score.';
      bullet(
        `Configured failure threshold: ${scoreFailThreshold}%. ${thresholdMessage}`,
        {
          stream: 'stderr',
        },
      );
    }

    process.exit(1);
  }
}

let passScore = 0;
let passDeductionPercent = 0;
let passTotalWeight = 0;

passTotalWeight = violations.reduce((s, v) => s + (v.weight || 1), 0);
passDeductionPercent = Math.min(
  SCORE_MAX,
  passTotalWeight * SCORE_DEDUCTION_PER_WEIGHT,
);
passScore = Math.max(0, SCORE_MAX - passDeductionPercent);

detail(
  `Score: ${passScore}% (deduction ${passDeductionPercent}% from total weight ${passTotalWeight})`,
);
if (scoreFailThreshold !== null) {
  detail(
    `Configured failure threshold: ${scoreFailThreshold}%. Above threshold -> OK by score.`,
  );
}

record('info', 'validate-ci.result', {
  status: 'PASS',
  violations: violations.length,
  warnings: warnings.length,
  score: passScore,
  deduction: passDeductionPercent,
  threshold: scoreFailThreshold,
});
section('result', 'Validate-CI passed', 'Policy checks satisfied');
process.exit(0);
