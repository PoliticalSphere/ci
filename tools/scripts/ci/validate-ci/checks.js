// ==============================================================================
// Political Sphere — Validate-CI Checks
// ------------------------------------------------------------------------------
// Purpose:
//   Apply policy checks to workflows and composite actions.
// ==============================================================================

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { detail, section } from './console.js';
import {
  extractUploadPaths,
  getJobLocation,
  getStepRunLocation,
  getStepStartLocation,
  getStepUsesLocation,
  getStepWithLocation,
  hasJobPermissionJustification,
  hasWorkflowPermissionJustification,
  isActionUpload,
  isDockerAction,
  isLocalAction,
  parseActionRef,
  parseWorkflow,
  repoFromAction,
  workflowKeyFromPath,
} from './parser.js';
import { permissionLevel } from './policies.js';
import { classifyRemoteVerifyResult } from './remote-verify.js';

// Optionally use the RE2 engine (if available) to protect against
// catastrophic backtracking. We try to require it at load time and fall
// back to native RegExp when not available.
let RE2 = null;
try {
  const require = createRequire(import.meta.url);
  RE2 = require('re2');
} catch {
  RE2 = null;
}

// Allow tests to override the regex engine (for injecting a fake engine).
let regexEngineOverride = null;
export function setRegexEngineForTest(engine) {
  regexEngineOverride = engine;
}

function isAllowlisted(allowlist, workflowPath, jobId, step) {
  for (const entry of allowlist) {
    if (entry.selector.workflow_path !== workflowPath) continue;
    if (entry.selector.job_id && entry.selector.job_id !== jobId) continue;
    if (entry.selector.step_id && entry.selector.step_id !== step.id) continue;
    if (entry.selector.step_name && entry.selector.step_name !== step.name)
      continue;
    if (!entry.selector.step_id && !entry.selector.step_name) continue;
    return true;
  }
  return false;
}

function makeViolation(rel, message, line = 1, column = null, weight = 1) {
  return { path: rel, message, line, column, weight };
}

function runHasAll(runLines, required) {
  if (!required || required.length === 0) return true;
  const joined = runLines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');

  return required.every((req) => {
    if (req === 'set -euo pipefail') {
      return /\bset\s+-euo\s+pipefail\b/.test(joined);
    }
    return joined.includes(req);
  });
}

// Helper: parse a brace quantifier starting at index i (where str[i] === '{')
// Returns { isQuantifier, isUnbounded, endIndex }
function parseBraceQuantifier(str, i) {
  const slice = str.slice(i);
  const match = slice.match(/^\{\s*(\d*)\s*(?:,\s*(\d*)\s*)?\}/);
  if (!match) {
    return { isQuantifier: false, isUnbounded: false, endIndex: i };
  }

  const hasComma = match[0].includes(',');
  const digitsBefore = match[1] || '';
  const digitsAfter = match[2] || '';

  if (!hasComma && digitsBefore.length === 0) {
    return { isQuantifier: false, isUnbounded: false, endIndex: i };
  }

  const endIndex = i + match[0].length - 1;
  const isUnbounded = hasComma && digitsAfter.length === 0;
  return { isQuantifier: true, isUnbounded, endIndex };
}

// Helper: detect unbounded quantifiers (+, *, or open-ended {,}) in a
// pattern fragment. Kept at module scope so it can be tested independently
// and to reduce nested complexity inside `compileRegex`.

// Skip over a character class starting at `idx` (where `str[idx] === '['`).
function skipCharClassIn(str, idx) {
  const len = str.length;
  idx++;
  while (idx < len) {
    if (str[idx] === '\\') {
      idx += 2;
      continue;
    }
    if (str[idx] === ']') {
      idx++;
      break;
    }
    idx++;
  }
  return idx;
}

// Return true if an unbounded quantifier appears at `idx` (e.g., '+', '*', or
// an open-ended brace quantifier like '{,}' or '{n,}').
function isUnboundedQuantifierAt(str, idx) {
  const ch = str[idx];
  if (ch === '+' || ch === '*') return true;
  if (ch === '{') {
    const q = parseBraceQuantifier(str, idx);
    return q.isQuantifier && q.isUnbounded;
  }
  return false;
}

function _hasUnboundedQuantifierIn(str) {
  let i = 0;
  const len = str.length;
  while (i < len) {
    const ch = str[i];
    // Skip escapes
    if (ch === '\\') {
      i += 2;
      continue;
    }
    // Skip character classes
    if (ch === '[') {
      i = skipCharClassIn(str, i);
      continue;
    }
    if (isUnboundedQuantifierAt(str, i)) return true;
    i++;
  }
  return false;
}

// Detect nested unbounded quantifiers: moved to module scope to improve
// testability and reduce nested function complexity inside `compileRegex`.
// Examples: `(.+)+`, `(a+){1,}`.

// Skip over a character class starting at `idx` (where `pat[idx] === '['`).
function skipCharClassFrom(pat, idx) {
  const len = pat.length;
  idx++;
  while (idx < len) {
    if (pat[idx] === '\\') {
      idx += 2;
      continue;
    }
    if (pat[idx] === ']') {
      idx++;
      break;
    }
    idx++;
  }
  return idx;
}

// Find the matching ')' for a group starting at `idx` (where `pat[idx] === '('`).
// Returns the index of the ')' or -1 if unbalanced.
function findGroupEnd(pat, idx) {
  const len = pat.length;
  let depth = 1;
  let j = idx + 1;
  while (j < len && depth > 0) {
    if (pat[j] === '\\') {
      j += 2;
      continue;
    }
    if (pat[j] === '[') {
      j = skipCharClassFrom(pat, j);
      continue;
    }
    if (pat[j] === '(') {
      depth++;
    } else if (pat[j] === ')') {
      depth--;
    }
    j++;
  }
  if (depth !== 0) return -1; // unbalanced
  return j - 1; // matching ')'
}

// Checks whether an outer unbounded quantifier appears at or after `pos`.
function hasOuterUnboundedAt(pat, pos) {
  const len = pat.length;
  let k = pos;
  while (k < len && /\s/.test(pat[k])) k++;
  if (k >= len) return false;
  if (pat[k] === '+' || pat[k] === '*') return true;
  if (pat[k] === '{') {
    const q = parseBraceQuantifier(pat, k);
    return q.isQuantifier && q.isUnbounded;
  }
  return false;
}

function _detectNestedUnbounded(pat) {
  const len = pat.length;
  let i = 0;

  while (i < len) {
    const ch = pat[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') {
      i = skipCharClassFrom(pat, i);
      continue;
    }
    if (ch === '(') {
      const end = findGroupEnd(pat, i);
      if (end === -1) return true; // unbalanced; conservative reject
      const inner = pat.slice(i + 1, end);
      if (
        _hasUnboundedQuantifierIn(inner) &&
        hasOuterUnboundedAt(pat, end + 1)
      ) {
        return true;
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return false;
}

function compileRegex(reStr) {
  let pattern = reStr;
  let flags = '';

  const flagMatch = pattern.match(/^\(\?([a-z]+)\)/);
  if (flagMatch) {
    flags = flagMatch[1];
    pattern = pattern.replace(/^\(\?[a-z]+\)/, '');
  }

  if (/[^im]/.test(flags)) {
    throw new Error(`unsupported regex flags '${flags}'`);
  }

  // Detect potentially catastrophic backtracking patterns such as nested
  // unbounded quantifiers (e.g., `(.+)+`, `(.+)*`, `(a+){1,}`) which can lead
  // to super-linear runtime on crafted inputs. We reject patterns that use
  // an inner unbounded quantifier followed by another unbounded quantifier.
  //
  // IMPORTANT: perform detection using a linear, hand-written scanner (no
  // regular expressions) to avoid exposing this check to the very vulnerabilities
  // it is intended to detect.
  // Brace quantifier parsing is now handled by `parseBraceQuantifier` in
  // module scope to reduce nested function complexity and improve testability.

  // _hasUnboundedQuantifierIn moved to module scope above to reduce nested
  // function complexity in `compileRegex`.

  // Nested detection moved to module scope: `_detectNestedUnbounded` is defined
  // above `compileRegex` to improve testability and reduce nested complexity.

  if (_detectNestedUnbounded(pattern)) {
    throw new Error(
      `unsafe regex pattern detected (potential catastrophic backtracking): ${pattern}`,
    );
  }

  // If a test has overridden the regex engine, use it (useful for unit tests).
  if (regexEngineOverride) return new regexEngineOverride(pattern, flags);

  // Prefer RE2 (if available) because it provides formal guarantees against
  // backtracking-based DoS. Fall back to native RegExp otherwise.
  if (RE2) return new RE2(pattern, flags);

  return new RegExp(pattern, flags);
}

export { compileRegex };

// Shared helper: validate a `uses:` reference (docker, remote action pinning, allowlist,
// and optional remote verification). Returns { violations, handled } where handled is
// true for cases (like docker) that should stop further processing of the reference.
async function checkUsesReference({
  rel,
  uses,
  line,
  col,
  allowedActions,
  validateRemoteAction,
}) {
  const violations = [];

  if (isDockerAction(uses)) {
    if (!uses.includes('@sha256:')) {
      violations.push(
        makeViolation(
          rel,
          `docker action not pinned by digest: ${uses}`,
          line,
          col,
          2,
        ),
      );
    }
    return { violations, handled: true };
  }

  const { action, ref } = parseActionRef(uses);
  const repo = repoFromAction(action);
  if (!allowedActions.has(repo)) {
    violations.push(
      makeViolation(rel, `action not allowlisted: ${repo}`, line, col, 3),
    );
  }

  if (!/^[a-f0-9]{40}$/.test(ref)) {
    violations.push(
      makeViolation(rel, `action not SHA-pinned: ${uses}`, line, col),
    );
  } else if (validateRemoteAction) {
    const result = await validateRemoteAction(action, ref);
    const info = classifyRemoteVerifyResult(result);
    if (info.shouldSkip) {
      return { violations, handled: false };
    }
    if (!info.ok) {
      violations.push(
        makeViolation(
          rel,
          `action ref could not be verified (${info.reason}): ${uses}`,
          line,
          col,
          info.weight,
        ),
      );
    }
  }

  return { violations, handled: false };
}

function reportUnsafePatternViolation({
  rel,
  jobId,
  step,
  pattern,
  unsafeAllowlist,
  weight = 3,
}) {
  const allow = isAllowlisted(unsafeAllowlist, rel, jobId, step);
  if (!allow) {
    const { line, column } = getStepStartLocation(step);
    return makeViolation(
      rel,
      `unsafe pattern ${pattern.id} in job '${jobId}'`,
      line,
      column,
      weight,
    );
  }
  return null;
}

function maybePushUnsafePatternViolation(
  violations,
  { rel, jobId, step, pattern, unsafeAllowlist, weight = 3 },
) {
  const viol = reportUnsafePatternViolation({
    rel,
    jobId,
    step,
    pattern,
    unsafeAllowlist,
    weight,
  });
  if (viol) violations.push(viol);
}

function checkWorkflowPermissions({
  rel,
  parsed,
  baseline,
  permissionsBaseline,
  workflowKey,
}) {
  const violations = [];
  // If there's no baseline configured for this workflow, only fail when the
  // workflow also does not declare top-level permissions — allowing a workflow
  // with explicit permissions to pass even without an explicit baseline.
  if (!baseline && !parsed.workflowPermissionsDeclared) {
    // Missing baseline is higher severity
    violations.push(
      makeViolation(
        rel,
        `no permissions baseline for workflow '${workflowKey}'`,
        1,
        null,
        3,
      ),
    );
  }

  if (!parsed.workflowPermissionsDeclared) {
    violations.push(
      makeViolation(rel, `missing top-level permissions`, 1, null, 3),
    );
  }

  if (!baseline) {
    return violations;
  }

  for (const [permissionName, permissionValue] of Object.entries(
    parsed.workflowPermissions,
  )) {
    const base =
      baseline[permissionName] || permissionsBaseline.defaults.unspecified;
    if (permissionLevel(permissionValue) > permissionLevel(base)) {
      if (!hasWorkflowPermissionJustification(parsed, permissionName)) {
        violations.push(
          makeViolation(
            rel,
            `permissions '${permissionName}' elevated without justification`,
            1,
            null,
            2,
          ),
        );
      }
    }
  }
  return violations;
}

function checkHighRiskTriggers({ rel, parsed, highRisk }) {
  const violations = [];
  for (const trigger of parsed.triggers) {
    if (highRisk.triggers.has(trigger)) {
      const allowForWf = highRisk.allowlist.get(rel);
      const allowed = allowForWf ? allowForWf.has(trigger) : false;
      if (!allowed) {
        violations.push(
          makeViolation(
            rel,
            `high-risk trigger '${trigger}' not allowlisted`,
            1,
          ),
        );
      }
    }
  }
  return violations;
}

function checkJobPermissions({
  rel,
  jobId,
  job,
  baseline,
  permissionsBaseline,
}) {
  const violations = [];
  if (!job.permissionsDeclared) {
    const { line, column } = getJobLocation(job);
    violations.push(
      makeViolation(rel, `job '${jobId}' missing permissions`, line, column, 3),
    );
  }

  if (!baseline) return violations;

  for (const [permissionName, permissionValue] of Object.entries(
    job.permissions,
  )) {
    const base =
      baseline[permissionName] || permissionsBaseline.defaults.unspecified;
    if (permissionLevel(permissionValue) > permissionLevel(base)) {
      if (!hasJobPermissionJustification(job, permissionName)) {
        const { line, column } = getJobLocation(job);
        violations.push(
          makeViolation(
            rel,
            `job '${jobId}' permission '${permissionName}' elevated without justification`,
            line,
            column,
            2,
          ),
        );
      }
    }
  }
  return violations;
}

function checkHardenRunnerFirst({
  rel,
  jobId,
  job,
  allowedFirstSteps,
  hardenRunnerActionAllowlist,
}) {
  const violations = [];
  if (job.steps.length === 0) return violations;
  const first = job.steps[0];
  const uses = first.uses || '';
  const allowlist = Array.isArray(allowedFirstSteps) ? allowedFirstSteps : [];
  const actionAllowlist = Array.isArray(hardenRunnerActionAllowlist)
    ? hardenRunnerActionAllowlist
    : [];

  // Combined allowlist: explicit allowed-first-steps (e.g. ps-bootstrap) and
  // explicitly permitted harden-runner actions (local paths or repo names).
  const combinedAllowlist = [...allowlist, ...actionAllowlist];

  const isHardenStep = (usesRef) =>
    combinedAllowlist.some((entry) => {
      // If entry is a prefix pattern (ends with @), allow prefix matches
      if (entry.endsWith('@')) return usesRef.startsWith(entry);
      // If entry looks like an owner/repo (contains '/' but not a local path),
      // allow repo@sha references (e.g., step-security/harden-runner@...)
      if (entry.includes('/') && !entry.startsWith('./'))
        return usesRef.startsWith(`${entry}@`) || usesRef === entry;
      // Otherwise, do an exact match (useful for local paths like './.github/actions/ps-harden-runner')
      return usesRef === entry;
    }) || usesRef.startsWith('step-security/harden-runner@');

  const isCheckoutStep = (usesRef) => usesRef.startsWith('actions/checkout@');

  const hardenOk = isHardenStep(uses);
  const checkoutBootstrapOk =
    isCheckoutStep(uses) &&
    job.steps.length > 1 &&
    isHardenStep(job.steps[1].uses || '');

  if (!hardenOk && !checkoutBootstrapOk) {
    const { line, column } = getStepStartLocation(first, job);
    violations.push(
      makeViolation(
        rel,
        `job '${jobId}' first step must be hardened runner`,
        line,
        column,
        2,
      ),
    );
  }
  return violations;
}

async function checkStepUses({
  rel,
  jobId,
  step,
  workspaceRoot,
  allowedActions,
  unsafePatterns,
  unsafeAllowlist,
  validateRemoteAction,
  localActions,
}) {
  const violations = [];
  const uses = step.uses;
  if (!uses) return violations;

  const localActionsEnabled = localActions?.enabled !== false;
  if (isLocalAction(uses)) {
    if (!localActionsEnabled) return violations;
    const localViolations = checkLocalActionStep({
      rel,
      uses,
      step,
      workspaceRoot,
    });
    const inputViolations = checkLocalActionInputs({ rel, jobId, step });
    violations.push(...localViolations, ...inputViolations);
    return violations;
  }

  const remoteViolations = await checkRemoteActionStep({
    rel,
    jobId,
    uses,
    step,
    allowedActions,
    unsafePatterns,
    unsafeAllowlist,
    validateRemoteAction,
  });
  violations.push(...remoteViolations);

  return violations;
}

function checkLocalActionInputs({ rel, jobId, step }) {
  const violations = [];
  const uses = step.uses || '';
  const normalized = uses.startsWith('./') ? uses : `./${uses}`;
  const allowlistRequiredFor = new Set([
    './.github/actions/ps-bootstrap/ps-init',
    './.github/actions/ps-init',
  ]);

  if (!allowlistRequiredFor.has(normalized)) {
    return violations;
  }

  const egressPolicy = String(step.with?.egress_policy || '').trim();
  if (!egressPolicy) {
    const { line, column } = getStepWithLocation(step);
    violations.push(
      makeViolation(
        rel,
        `ps-init requires explicit egress_policy in job '${jobId}'`,
        line,
        column,
        2,
      ),
    );
  }

  const skipRaw = String(step.with?.skip_platform_checkout || '')
    .split('#')[0]
    .replaceAll('"', '')
    .replaceAll("'", '')
    .trim();
  const skipLower = skipRaw.toLowerCase();
  const skipPlatform =
    skipLower === '1' || skipLower === 'true' || skipLower === 'yes';
  if (skipPlatform) {
    return violations;
  }

  const allowlist = String(step.with?.platform_allowed_repositories || '');
  if (!allowlist.trim()) {
    const { line, column } = getStepStartLocation(step);
    violations.push(
      makeViolation(
        rel,
        `ps-init requires platform_allowed_repositories allowlist in job '${jobId}'`,
        line,
        column,
        2,
      ),
    );
  }

  return violations;
}

function checkLocalActionStep({ rel, uses, step, workspaceRoot }) {
  const violationsLocal = [];
  const normalized = uses.startsWith('./') ? uses : `./${uses}`;
  const resolved = path.resolve(workspaceRoot, normalized);
  const relative = path.relative(workspaceRoot, resolved);
  const actionsRoot = path.join(workspaceRoot, '.github', 'actions');
  const actionsRelative = path.relative(actionsRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const { line, column } = getStepStartLocation(step);
    violationsLocal.push(
      makeViolation(
        rel,
        `local action path escapes repo: ${uses}`,
        line,
        column,
      ),
    );
    return violationsLocal;
  }

  if (actionsRelative.startsWith('..') || path.isAbsolute(actionsRelative)) {
    const { line, column } = getStepStartLocation(step);
    violationsLocal.push(
      makeViolation(
        rel,
        `local actions must live under .github/actions: ${uses}`,
        line,
        column,
        2,
      ),
    );
    return violationsLocal;
  }

  let actionDir = resolved;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    actionDir = path.dirname(resolved);
  }

  const hasYml = fs.existsSync(path.join(actionDir, 'action.yml'));
  const hasYaml = fs.existsSync(path.join(actionDir, 'action.yaml'));

  if (!hasYml && !hasYaml) {
    const { line, column } = getStepStartLocation(step);
    violationsLocal.push(
      makeViolation(
        rel,
        `local action missing action.yml or action.yaml: ${uses}`,
        line,
        column,
        2,
      ),
    );
  }

  return violationsLocal;
}

async function checkRemoteActionStep({
  rel,
  jobId,
  uses,
  step,
  allowedActions,
  unsafePatterns,
  unsafeAllowlist,
  validateRemoteAction,
}) {
  const violations = [];
  // Validate `uses:` reference for remote/docker/allowlist/pinning.
  const usesLocation = getStepUsesLocation(step);
  const check = await checkUsesReference({
    rel,
    uses,
    line: usesLocation.line,
    col: usesLocation.column,
    allowedActions,
    validateRemoteAction,
  });
  violations.push(...check.violations);
  if (check.handled) return violations;

  for (const pattern of unsafePatterns) {
    if (!pattern.uses) continue;
    const { action } = parseActionRef(uses);
    const repo = repoFromAction(action);
    if (repo !== pattern.uses) continue;

    const match = Object.entries(pattern.with || {}).every(([k, v]) => {
      const actual = String(step.with[k] || '');
      return actual.replaceAll('"', '') === String(v);
    });

    if (match) {
      maybePushUnsafePatternViolation(violations, {
        rel,
        jobId,
        step,
        pattern,
        unsafeAllowlist,
      });
    }
  }

  return violations;
}

function checkInlineRun({
  rel,
  jobId,
  step,
  inlineAllowlist,
  inlineConstraints,
  inlineMaxLines,
  unsafePatterns,
  unsafeAllowlist,
}) {
  const violations = [];
  if (step.runLines.length === 0) return violations;

  const runLineCount = step.runLines.filter((l) => l.trim().length > 0).length;
  const allowInline = isAllowlisted(inlineAllowlist, rel, jobId, step);
  const hasStrictMode = runHasAll(step.runLines, ['set -euo pipefail']);

  violations.push(...checkInlineSecrets({ rel, jobId, step }));

  if (allowInline) {
    violations.push(
      ...checkInlineAllowlistConstraints({
        rel,
        jobId,
        step,
        inlineConstraints,
      }),
    );
  } else {
    if (runLineCount > inlineMaxLines) {
      const { line, column } = getStepRunLocation(step);
      violations.push(
        makeViolation(
          rel,
          `inline bash too long in job '${jobId}'`,
          line,
          column,
          1,
        ),
      );
    }
    if (!hasStrictMode) {
      const { line, column } = getStepRunLocation(step);
      violations.push(
        makeViolation(
          rel,
          `inline bash missing 'set -euo pipefail' in job '${jobId}'`,
          line,
          column,
          1,
        ),
      );
    }
  }

  violations.push(
    ...checkUnsafeRunPatterns({
      rel,
      jobId,
      step,
      unsafePatterns,
      unsafeAllowlist,
    }),
  );

  return violations;
}

function checkInlineSecrets({ rel, jobId, step }) {
  const violations = [];
  if (/\${{\s*secrets\./.test(step.run)) {
    const { line, column } = getStepRunLocation(step);
    violations.push(
      makeViolation(
        rel,
        `secrets interpolated in run in job '${jobId}'`,
        line,
        column,
        3,
      ),
    );
  }
  return violations;
}

function checkInlineAllowlistConstraints({
  rel,
  jobId,
  step,
  inlineConstraints,
}) {
  const violations = [];
  for (const r of inlineConstraints.forbidRegex) {
    let re;
    try {
      re = compileRegex(r);
    } catch (err) {
      const { line, column } = getStepRunLocation(step);
      violations.push(
        makeViolation(
          rel,
          `invalid inline allowlist regex '${r}': ${err.message}`,
          line,
          column,
          3,
        ),
      );
      continue;
    }
    if (re.test(step.run)) {
      const { line, column } = getStepRunLocation(step);
      violations.push(
        makeViolation(
          rel,
          `inline bash allowlist constraints violated in job '${jobId}'`,
          line,
          column,
          2,
        ),
      );
      break;
    }
  }

  if (!runHasAll(step.runLines, inlineConstraints.requireContains)) {
    const { line, column } = getStepRunLocation(step);
    violations.push(
      makeViolation(
        rel,
        `inline bash allowlist missing required content in job '${jobId}'`,
        line,
        column,
        2,
      ),
    );
  }

  return violations;
}

function checkUnsafeRunPatterns({
  rel,
  jobId,
  step,
  unsafePatterns,
  unsafeAllowlist,
}) {
  const violations = [];
  for (const pattern of unsafePatterns) {
    for (const reStr of pattern.runRegex || []) {
      let re;
      try {
        re = compileRegex(reStr);
      } catch (err) {
        const { line, column } = getStepRunLocation(step);
        violations.push(
          makeViolation(
            rel,
            `invalid unsafe pattern regex '${reStr}' (${pattern.id}): ${err.message}`,
            line,
            column,
            3,
          ),
        );
        continue;
      }
      if (re.test(step.run)) {
        maybePushUnsafePatternViolation(violations, {
          rel,
          jobId,
          step,
          pattern,
          unsafeAllowlist,
        });
      }
    }
  }
  return violations;
}

function checkSectionHeaders({ rel, jobId, step }) {
  const violations = [];
  if (step.runLines.length === 0) return violations;
  if (!/print-section\.sh/.test(step.run)) {
    const { line, column } = getStepRunLocation(step);
    violations.push(
      makeViolation(
        rel,
        `inline run missing section header in job '${jobId}'`,
        line,
        column,
        1,
      ),
    );
  }
  return violations;
}

function checkSecretsHandling({ rel, jobId, step }) {
  const violations = [];
  const run = step.run || '';
  const runLines = step.runLines || [];
  const withValues = Object.values(step.with || {}).map(String);
  const hasSecretsInRun = /\${{\s*secrets\./.test(run);
  const hasSecretsInWith = withValues.some((v) => /\${{\s*secrets\./.test(v));

  if (hasSecretsInWith) {
    const { line: wLine, column: wCol } = getStepWithLocation(step);
    violations.push(
      makeViolation(
        rel,
        `secrets interpolated in 'with' for job '${jobId}'`,
        wLine,
        wCol,
        3,
      ),
    );
  }

  if (hasSecretsInRun) {
    const { line: rLine, column: rCol } = getStepRunLocation(step);
    if (/\bset\s+-x\b|\bset\s+-o\s+xtrace\b/.test(run)) {
      violations.push(
        makeViolation(
          rel,
          `debug xtrace used alongside secrets in job '${jobId}'`,
          rLine,
          rCol,
          3,
        ),
      );
    }
    const echoLineIdx = runLines.findIndex(
      (line) => /\${{\s*secrets\./.test(line) && /\b(echo|printf)\b/.test(line),
    );
    if (echoLineIdx >= 0) {
      const { line, column } = getStepRunLocation(step, echoLineIdx);
      violations.push(
        makeViolation(
          rel,
          `echo/printf used alongside secrets in job '${jobId}'`,
          line,
          column,
          3,
        ),
      );
    }
  }

  return violations;
}

function checkBinaryDownloadWithoutChecksum({ rel, jobId, step }) {
  const violations = [];
  const run = step.run || '';
  if (!run) return violations;
  const runLines = step.runLines || [];

  const downloads = new Set();
  for (const line of runLines) {
    const match = line.match(
      /\b(curl|wget)\b[^\n]*\s(?:-o|--output|-O)\s+([^\s"'`]+)/,
    );
    if (!match) continue;
    const target = match[2].replaceAll(/(^['"]|['"]$)/g, '');
    if (target) downloads.add(target);
  }

  if (downloads.size === 0) return violations;

  const hasChecksum = runLines.some((line) =>
    /\b(sha256sum|shasum)\b/.test(line) && /\s(-c|--check)\b/.test(line),
  );
  const hasGpgVerify = runLines.some((line) => /\bgpg\b/.test(line) && /--verify\b/.test(line));
  if (hasChecksum || hasGpgVerify) return violations;

  const escapeRegex = (value) =>
    value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\\$&`);

  for (const file of downloads) {
    const escaped = escapeRegex(file);
    const execRegex = new RegExp(String.raw`(^|\s|;)(\./)?${escaped}(\s|$|;)`);
    const chmodRegex = new RegExp(String.raw`\bchmod\s+\+x\s+${escaped}(\s|$)`);
    const installRegex = new RegExp(String.raw`\binstall\b[^\n]*\s${escaped}(\s|$)`);

    const execLineIdx = runLines.findIndex(
      (line) =>
        !/\b(curl|wget)\b/.test(line) &&
        (execRegex.test(line) || chmodRegex.test(line) || installRegex.test(line)),
    );
    if (execLineIdx >= 0) {
      const { line, column } = getStepRunLocation(step, execLineIdx);
      violations.push(
        makeViolation(
          rel,
          `downloaded binary '${file}' executed without checksum or GPG verification in job '${jobId}'`,
          line,
          column,
          3,
        ),
      );
    }
  }

  return violations;
}

function checkArtifactPolicy({
  rel,
  workflowKey,
  uploadNames,
  uploadPaths,
  policy,
}) {
  const violations = [];
  if (!policy.allowlist.has(workflowKey)) return violations;

  const allowedNames = policy.allowlist.get(workflowKey);
  for (const name of uploadNames) {
    if (!allowedNames.has(name)) {
      violations.push(
        makeViolation(rel, `artifact name not allowlisted: ${name}`, 1, null),
      );
    }
  }

  const parametric = uploadPaths.some((p) =>
    p.includes('inputs.artifact_paths'),
  );
  for (const required of policy.requiredPaths) {
    if (parametric) break;
    const found = uploadPaths.some((p) => p.includes(required));
    if (!found) {
      violations.push(
        makeViolation(
          rel,
          `required artifact path missing: ${required}`,
          1,
          null,
        ),
      );
    }
  }

  return violations;
}

async function processStep({
  rel,
  jobId,
  step,
  workspaceRoot,
  allowedActions,
  unsafePatterns,
  unsafeAllowlist,
  validateRemoteAction,
  localActions,
  inlineAllowlist,
  inlineConstraints,
  inlineMaxLines,
  requireSectionHeaders,
  uploadNames,
  uploadPaths,
}) {
  const violations = [];

  const stepViolations = await checkStepUses({
    rel,
    jobId,
    step,
    workspaceRoot,
    allowedActions,
    unsafePatterns,
    unsafeAllowlist,
    validateRemoteAction,
    localActions,
  });

  violations.push(
    ...stepViolations,
    ...checkInlineRun({
      rel,
      jobId,
      step,
      inlineAllowlist,
      inlineConstraints,
      inlineMaxLines,
      unsafePatterns,
      unsafeAllowlist,
    }),
    ...checkSecretsHandling({
      rel,
      jobId,
      step,
    }),
    ...checkBinaryDownloadWithoutChecksum({
      rel,
      jobId,
      step,
    }),
    ...(requireSectionHeaders
      ? checkSectionHeaders({
          rel,
          jobId,
          step,
        })
      : []),
  );

  if (step.uses && isActionUpload(step.uses)) {
    if (step.with.name) {
      uploadNames.push(String(step.with.name).replaceAll('"', ''));
    } else if (step.with.artifacts_name) {
      uploadNames.push(String(step.with.artifacts_name).replaceAll('"', ''));
    }
    for (const p of extractUploadPaths(step)) {
      uploadPaths.push(p);
    }
  }

  return violations;
}

export async function scanWorkflows({
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
  quiet = false,
}) {
  const violations = [];
  const warnings = [];

  for (const wfPath of workflows) {
    const rel = path.relative(workspaceRoot, wfPath);
    const rawWf = fs.readFileSync(wfPath, 'utf8');
    const parsed = parseWorkflow(rawWf);
    collectParseWarnings(parsed, rel, warnings, quiet);
    const workflowKey = workflowKeyFromPath(rel);

    if (!quiet) {
      section('workflow', 'Scanning workflow', rel);
    }

    const baseline = permissionsBaseline.workflows[workflowKey];
    violations.push(
      ...checkWorkflowPermissions({
        rel,
        parsed,
        baseline,
        permissionsBaseline,
        workflowKey,
      }),
      ...checkHighRiskTriggers({
        rel,
        parsed,
        highRisk,
      }),
    );

    const {
      violations: jobViolations,
      uploadNames,
      uploadPaths,
    } = await scanWorkflowJobs({
      rel,
      parsed,
      baseline,
      permissionsBaseline,
      allowedFirstSteps,
      hardenRunnerActionAllowlist,
      workspaceRoot,
      allowedActions,
      unsafePatterns,
      unsafeAllowlist,
      validateRemoteAction,
      localActions,
      inlineAllowlist,
      inlineConstraints,
      inlineMaxLines,
      requireSectionHeaders,
    });

    violations.push(
      ...jobViolations,
      ...checkArtifactPolicy({
        rel,
        workflowKey,
        uploadNames,
        uploadPaths,
        policy: artifactPolicy,
      }),
    );
  }

  return { violations, warnings };
}

function collectParseWarnings(parsed, rel, warnings, quiet) {
  if (!parsed.parseWarnings?.length) return;
  for (const warn of parsed.parseWarnings) {
    warnings.push({ workflow: rel, ...warn });
    if (!quiet) {
      detail(`WARN: ${warn.message}`);
    }
  }
}

async function scanWorkflowJobs({
  rel,
  parsed,
  baseline,
  permissionsBaseline,
  allowedFirstSteps,
  hardenRunnerActionAllowlist,
  workspaceRoot,
  allowedActions,
  unsafePatterns,
  unsafeAllowlist,
  validateRemoteAction,
  localActions,
  inlineAllowlist,
  inlineConstraints,
  inlineMaxLines,
  requireSectionHeaders,
}) {
  const violations = [];
  const uploadNames = [];
  const uploadPaths = [];

  for (const [jobId, job] of Object.entries(parsed.jobs)) {
    violations.push(
      ...checkJobPermissions({
        rel,
        jobId,
        job,
        baseline,
        permissionsBaseline,
      }),
      ...checkHardenRunnerFirst({
        rel,
        jobId,
        job,
        allowedFirstSteps,
        hardenRunnerActionAllowlist,
      }),
    );

    for (const step of job.steps) {
      const stepViolations = await processStep({
        rel,
        jobId,
        step,
        workspaceRoot,
        allowedActions,
        unsafePatterns,
        unsafeAllowlist,
        validateRemoteAction,
        localActions,
        inlineAllowlist,
        inlineConstraints,
        inlineMaxLines,
        requireSectionHeaders,
        uploadNames,
        uploadPaths,
      });
      violations.push(...stepViolations);
    }
  }

  return { violations, uploadNames, uploadPaths };
}

export async function scanActions({
  actions,
  platformRoot,
  allowedActions,
  validateRemoteAction,
  quiet = false,
}) {
  const violations = [];
  for (const actionPath of actions) {
    const rel = path.relative(platformRoot, actionPath);
    const rawAction = fs.readFileSync(actionPath, 'utf8');
    const lines = rawAction.split(/\r?\n/);

    if (!quiet) {
      section('action', 'Scanning composite action', rel);
    }

    const fileViolations = await scanActionLines({
      rel,
      lines,
      allowedActions,
      validateRemoteAction,
    });
    violations.push(...fileViolations);
  }
  return violations;
}

async function scanActionLines({
  rel,
  lines,
  allowedActions,
  validateRemoteAction,
}) {
  const violations = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const usesMatch = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/);
    if (!usesMatch) continue;

    const uses = usesMatch[1];
    if (isLocalAction(uses)) continue;

    // Validate `uses:` reference for remote/docker/allowlist/pinning.
    const col = line.indexOf('uses') + 1 || null;
    const check = await checkUsesReference({
      rel,
      uses,
      line: lineNumber,
      col,
      allowedActions,
      validateRemoteAction,
    });
    violations.push(...check.violations);
  }
  return violations;
}
