// ==============================================================================
// Political Sphere — Validate-CI Checks
// ------------------------------------------------------------------------------
// Purpose:
//   Apply policy checks to workflows and composite actions.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

import { section } from './console.js';
import {
  extractUploadPaths,
  isActionUpload,
  isDockerAction,
  isLocalAction,
  parseActionRef,
  parseWorkflow,
  repoFromAction,
  workflowKeyFromPath,
} from './parser.js';
import { permissionLevel } from './policies.js';

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

  return new RegExp(pattern, flags);
}

// Shared helper: validate a `uses:` reference (docker, remote action pinning, allowlist,
// and optional remote verification). Returns { violations, handled } where handled is
// true for cases (like docker) that should stop further processing of the reference.
function checkUsesReference({
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
    const result = validateRemoteAction(action, ref);
    const ok = typeof result === 'boolean' ? result : Boolean(result?.ok);
    if (!ok) {
      let reason = 'remote lookup failed';
      if (typeof result === 'object') {
        if (result.error === 'ref_not_found') {
          reason = 'ref not found';
        } else if (result.error === 'remote_unreachable') {
          reason = 'remote unreachable';
        } else if (result.error === 'invalid_action_ref') {
          reason = 'invalid action reference';
        }
      }
      violations.push(
        makeViolation(
          rel,
          `action ref could not be verified (${reason}): ${uses}`,
          line,
          col,
          2,
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
    return makeViolation(
      rel,
      `unsafe pattern ${pattern.id} in job '${jobId}'`,
      step.startLine || 1,
      step.startColumn || null,
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

  for (const [perm, value] of Object.entries(parsed.workflowPermissions)) {
    const base = baseline[perm] || permissionsBaseline.defaults.unspecified;
    if (permissionLevel(value) > permissionLevel(base)) {
      const meta = parsed.workflowPermissionsMeta[perm] || {};
      if (!meta.hasJustification) {
        violations.push(
          makeViolation(
            rel,
            `permissions '${perm}' elevated without justification`,
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
    const line = job.startLine || 1;
    const col = job.startColumn || null;
    violations.push(
      makeViolation(rel, `job '${jobId}' missing permissions`, line, col, 3),
    );
  }

  if (!baseline) return violations;

  for (const [perm, value] of Object.entries(job.permissions)) {
    const base = baseline[perm] || permissionsBaseline.defaults.unspecified;
    if (permissionLevel(value) > permissionLevel(base)) {
      const meta = job.permissionsMeta[perm] || {};
      if (!meta.hasJustification) {
        const line = job.startLine || 1;
        const col = job.startColumn || null;
        violations.push(
          makeViolation(
            rel,
            `job '${jobId}' permission '${perm}' elevated without justification`,
            line,
            col,
            2,
          ),
        );
      }
    }
  }
  return violations;
}

function checkHardenRunnerFirst({ rel, jobId, job, allowedFirstSteps }) {
  const violations = [];
  if (job.steps.length === 0) return violations;
  const first = job.steps[0];
  const uses = first.uses || '';
  const allowlist = Array.isArray(allowedFirstSteps) ? allowedFirstSteps : [];
  const isHardenStep = (value) =>
    allowlist.some((entry) =>
      entry.endsWith('@') ? value.startsWith(entry) : value === entry,
    ) || value.startsWith('step-security/harden-runner@');

  const isCheckoutStep = (value) => value.startsWith('actions/checkout@');

  const hardenOk = isHardenStep(uses);
  const checkoutBootstrapOk =
    isCheckoutStep(uses) &&
    job.steps.length > 1 &&
    isHardenStep(job.steps[1].uses || '');

  if (!hardenOk && !checkoutBootstrapOk) {
    const line = first.startLine || job.startLine || 1;
    const col = first.startColumn || job.startColumn || null;
    violations.push(
      makeViolation(
        rel,
        `job '${jobId}' first step must be hardened runner`,
        line,
        col,
        2,
      ),
    );
  }
  return violations;
}

function checkStepUses({
  rel,
  jobId,
  step,
  workspaceRoot,
  allowedActions,
  unsafePatterns,
  unsafeAllowlist,
  validateRemoteAction,
}) {
  const violations = [];
  const uses = step.uses;
  if (!uses) return violations;

  if (isLocalAction(uses)) {
    const violationsLocal = [];
    const normalized = uses.startsWith('./') ? uses : `./${uses}`;
    const resolved = path.resolve(workspaceRoot, normalized);
    const relative = path.relative(workspaceRoot, resolved);
    const actionsRoot = path.join(workspaceRoot, '.github', 'actions');
    const actionsRelative = path.relative(actionsRoot, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      violationsLocal.push(
        makeViolation(
          rel,
          `local action path escapes repo: ${uses}`,
          step.startLine || 1,
          step.startColumn || null,
        ),
      );
      return violationsLocal;
    }

    if (actionsRelative.startsWith('..') || path.isAbsolute(actionsRelative)) {
      violationsLocal.push(
        makeViolation(
          rel,
          `local actions must live under .github/actions: ${uses}`,
          step.startLine || 1,
          step.startColumn || null,
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
      violationsLocal.push(
        makeViolation(
          rel,
          `local action missing action.yml or action.yaml: ${uses}`,
          step.startLine || 1,
          step.startColumn || null,
          2,
        ),
      );
    }

    return violationsLocal;
  }

  // Validate `uses:` reference for remote/docker/allowlist/pinning.
  const check = checkUsesReference({
    rel,
    uses,
    line: step.startLine || 1,
    col: step.usesColumn || step.startColumn || null,
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

    let match = true;
    for (const [k, v] of Object.entries(pattern.with || {})) {
      const actual = String(step.with[k] || '');
      if (actual.replace(/"/g, '') !== String(v)) {
        match = false;
        break;
      }
    }

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

  if (/\${{\s*secrets\./.test(step.run)) {
    violations.push(
      makeViolation(
        rel,
        `secrets interpolated in run in job '${jobId}'`,
        step.runLineNumbers?.[0] || step.startLine || 1,
        step.runLineColumns?.[0] || step.startColumn || null,
        3,
      ),
    );
  }

  if (!allowInline) {
    if (runLineCount > inlineMaxLines) {
      violations.push(
        makeViolation(
          rel,
          `inline bash too long in job '${jobId}'`,
          step.runLineNumbers?.[0] || step.startLine || 1,
          step.runLineColumns?.[0] || step.startColumn || null,
          1,
        ),
      );
    }
    if (!hasStrictMode) {
      violations.push(
        makeViolation(
          rel,
          `inline bash missing 'set -euo pipefail' in job '${jobId}'`,
          step.runLineNumbers?.[0] || step.startLine || 1,
          step.runLineColumns?.[0] || step.startColumn || null,
          1,
        ),
      );
    }
  } else {
    for (const r of inlineConstraints.forbidRegex) {
      let re;
      try {
        re = compileRegex(r);
      } catch (err) {
        violations.push(
          makeViolation(
            rel,
            `invalid inline allowlist regex '${r}': ${err.message}`,
            step.runLineNumbers?.[0] || step.startLine || 1,
            step.runLineColumns?.[0] || step.startColumn || null,
            3,
          ),
        );
        continue;
      }
      if (re.test(step.run)) {
        violations.push(
          makeViolation(
            rel,
            `inline bash allowlist constraints violated in job '${jobId}'`,
            step.runLineNumbers?.[0] || step.startLine || 1,
            step.runLineColumns?.[0] || step.startColumn || null,
            2,
          ),
        );
        break;
      }
    }
    if (!runHasAll(step.runLines, inlineConstraints.requireContains)) {
      violations.push(
        makeViolation(
          rel,
          `inline bash allowlist missing required content in job '${jobId}'`,
          step.runLineNumbers?.[0] || step.startLine || 1,
          step.runLineColumns?.[0] || step.startColumn || null,
          2,
        ),
      );
    }
  }

  for (const pattern of unsafePatterns) {
    for (const reStr of pattern.runRegex || []) {
      let re;
      try {
        re = compileRegex(reStr);
      } catch (err) {
        violations.push(
          makeViolation(
            rel,
            `invalid unsafe pattern regex '${reStr}' (${pattern.id}): ${err.message}`,
            step.runLineNumbers?.[0] || step.startLine || 1,
            step.runLineColumns?.[0] || step.startColumn || null,
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
    violations.push(
      makeViolation(
        rel,
        `inline run missing section header in job '${jobId}'`,
        step.runLineNumbers?.[0] || step.startLine || 1,
        step.runLineColumns?.[0] || step.startColumn || null,
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
  const withValues = Object.values(step.with || {}).map((v) => String(v));
  const hasSecretsInRun = /\${{\s*secrets\./.test(run);
  const hasSecretsInWith = withValues.some((v) => /\${{\s*secrets\./.test(v));

  if (hasSecretsInWith) {
    const wLine = step.withLineNumbers?.[0] || step.startLine || 1;
    const wCol = step.withLineColumns?.[0] || step.startColumn || null;
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
    const rLine = step.runLineNumbers?.[0] || step.startLine || 1;
    const rCol = step.runLineColumns?.[0] || step.startColumn || null;
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
    let echoLineIdx = -1;
    for (let idx = 0; idx < runLines.length; idx++) {
      const line = runLines[idx];
      if (/\${{\s*secrets\./.test(line) && /\b(echo|printf)\b/.test(line)) {
        echoLineIdx = idx;
        break;
      }
    }
    if (echoLineIdx !== -1) {
      const line = step.runLineNumbers?.[echoLineIdx] || rLine;
      const col = step.runLineColumns?.[echoLineIdx] || rCol;
      violations.push(
        makeViolation(
          rel,
          `echo/printf used alongside secrets in job '${jobId}'`,
          line,
          col,
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

export function scanWorkflows({
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
  quiet = false,
}) {
  const violations = [];

  for (const wfPath of workflows) {
    const rel = path.relative(workspaceRoot, wfPath);
    const rawWf = fs.readFileSync(wfPath, 'utf8');
    const parsed = parseWorkflow(rawWf);
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
    );
    violations.push(
      ...checkHighRiskTriggers({
        rel,
        parsed,
        highRisk,
      }),
    );

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
      );
      violations.push(
        ...checkHardenRunnerFirst({ rel, jobId, job, allowedFirstSteps }),
      );

      for (const step of job.steps) {
        violations.push(
          ...checkStepUses({
            rel,
            jobId,
            step,
            workspaceRoot,
            allowedActions,
            unsafePatterns,
            unsafeAllowlist,
            validateRemoteAction,
          }),
        );
        violations.push(
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
        );
        violations.push(
          ...checkSecretsHandling({
            rel,
            jobId,
            step,
          }),
        );
        if (requireSectionHeaders) {
          violations.push(
            ...checkSectionHeaders({
              rel,
              jobId,
              step,
            }),
          );
        }

        if (step.uses && isActionUpload(step.uses)) {
          if (step.with.name) {
            uploadNames.push(String(step.with.name).replace(/"/g, ''));
          }
          for (const p of extractUploadPaths(step)) {
            uploadPaths.push(p);
          }
        }
      }
    }

    violations.push(
      ...checkArtifactPolicy({
        rel,
        workflowKey,
        uploadNames,
        uploadPaths,
        policy: artifactPolicy,
      }),
    );
  }

  return violations;
}

export function scanActions({
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
      const check = checkUsesReference({
        rel,
        uses,
        line: lineNumber,
        col,
        allowedActions,
        validateRemoteAction,
      });
      violations.push(...check.violations);
      if (check.handled) continue;
    }
  }
  return violations;
}
