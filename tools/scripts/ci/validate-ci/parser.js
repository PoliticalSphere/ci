// ==============================================================================
// Political Sphere — Validate-CI Workflow Parser
// ------------------------------------------------------------------------------
// Purpose:
//   Parse GitHub Actions workflow YAML with a minimal state machine.
// ==============================================================================

import path from 'node:path';

import yaml from 'yaml';

export function isLocalAction(uses) {
  return uses.startsWith('./') || uses.startsWith('.github/');
}

export function isDockerAction(uses) {
  return uses.startsWith('docker://');
}

export function parseActionRef(uses) {
  const at = uses.lastIndexOf('@');
  if (at === -1) return { action: uses, ref: '' };
  return { action: uses.slice(0, at), ref: uses.slice(at + 1) };
}

export function repoFromAction(action) {
  const parts = action.split('/');
  if (parts.length < 2) return action;
  return `${parts[0]}/${parts[1]}`;
}

export function parsePermissionValue(value) {
  const v = String(value).replaceAll('"', '').toLowerCase();
  if (v === 'none' || v === 'read' || v === 'write') return v;
  return 'unknown';
}

function createResult() {
  return {
    workflowPermissionsDeclared: false,
    workflowPermissions: {},
    workflowPermissionsMeta: {},
    jobs: {},
    triggers: new Set(),
    parseWarnings: [],
  };
}

function createState() {
  return {
    inOn: false,
    onIndent: 0,
    inJobs: false,
    currentJob: '',
    inSteps: false,
    currentStep: null,
    inWith: false,
    withIndent: 0,
    inRunBlock: false,
    runBlockIndent: 0,
    inWorkflowPerms: false,
    workflowPermIndent: 0,
    inJobPerms: false,
    jobPermIndent: 0,
  };
}

function ensureJob(result, jobId) {
  if (!result.jobs[jobId]) {
    result.jobs[jobId] = {
      permissionsDeclared: false,
      permissions: {},
      permissionsMeta: {},
      steps: [],
    };
  }
}

function finishStep(state, result) {
  if (state.currentStep && state.currentJob) {
    result.jobs[state.currentJob].steps.push(state.currentStep);
  }
  state.currentStep = null;
  state.inWith = false;
  state.inRunBlock = false;
}

function updateStateOnIndent(state, indent) {
  if (state.inRunBlock && indent <= state.runBlockIndent) {
    state.inRunBlock = false;
  }
  if (state.inWith && indent <= state.withIndent) {
    state.inWith = false;
  }
  if (state.inWorkflowPerms && indent <= state.workflowPermIndent) {
    state.inWorkflowPerms = false;
  }
  if (state.inJobPerms && indent <= state.jobPermIndent) {
    state.inJobPerms = false;
  }
  if (state.inOn && indent <= state.onIndent) {
    state.inOn = false;
  }
}

function handleInlineOn(result, line) {
  const inlineOn = line.match(/^\s*on:\s*\[(.+)\]\s*$/);
  if (!inlineOn) return false;
  const parts = inlineOn[1].split(',').map((p) => p.trim());
  for (const p of parts) {
    if (p) result.triggers.add(p);
  }
  return true;
}

function applyTriggersFromDoc(result, doc) {
  if (!doc || typeof doc !== 'object') return;
  const on = doc.on ?? doc.on;
  if (!on) return;
  if (typeof on === 'string') {
    result.triggers.add(on);
    return;
  }
  if (Array.isArray(on)) {
    for (const entry of on) {
      if (entry) result.triggers.add(String(entry));
    }
    return;
  }
  if (typeof on === 'object') {
    for (const key of Object.keys(on)) {
      if (key) result.triggers.add(key);
    }
  }
}

function handleOnStart(state, line, indent) {
  if (!/^\s*on\s*:/.test(line)) return false;
  state.inOn = true;
  state.onIndent = indent;
  return true;
}

function handleOnTrigger(state, result, line) {
  if (!state.inOn) return false;
  const trigMatch = line.match(/^\s{2}([A-Za-z0-9_-]+)\s*:/);
  if (trigMatch) {
    result.triggers.add(trigMatch[1]);
    return true;
  }
  return false;
}

function handleWorkflowPermsStart(state, result, line, indent) {
  if (!/^permissions\s*:/.test(line)) return false;
  result.workflowPermissionsDeclared = true;
  state.inWorkflowPerms = true;
  state.workflowPermIndent = indent;
  return true;
}

function handleWorkflowPermsLine(state, result, line) {
  if (!state.inWorkflowPerms) return false;
  const permMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*([^\s#]+)\s*(#.*)?$/);
  if (!permMatch) return false;
  const key = permMatch[1];
  const value = parsePermissionValue(permMatch[2]);
  result.workflowPermissions[key] = value;
  const hasJustification =
    Boolean(permMatch[3]) && /justification/i.test(permMatch[3]);
  result.workflowPermissionsMeta[key] = { hasJustification };
  return true;
}

function handleJobsStart(state, line) {
  if (!/^jobs\s*:/.test(line)) return false;
  state.inJobs = true;
  return true;
}

function handleJobStart(state, result, line, lineNumber) {
  if (!state.inJobs) return false;
  const jobMatch = line.match(/^\s{2}([A-Za-z0-9_-]+)\s*:\s*(#.*)?$/);
  if (!jobMatch) return false;
  finishStep(state, result);
  state.currentJob = jobMatch[1];
  ensureJob(result, state.currentJob);
  // record the job starting line & column for better diagnostics
  result.jobs[state.currentJob].startLine = lineNumber;
  result.jobs[state.currentJob].startColumn = line.indexOf(jobMatch[1]) + 1;
  state.inSteps = false;
  return true;
}

function handleJobPermsStart(state, result, line, indent) {
  if (!state.currentJob || !/^\s{4}permissions\s*:/.test(line)) return false;
  result.jobs[state.currentJob].permissionsDeclared = true;
  state.inJobPerms = true;
  state.jobPermIndent = indent;
  return true;
}

function handleJobPermsLine(state, result, line) {
  if (!state.inJobPerms || !state.currentJob) return false;
  const permMatch = line.match(/^\s{6}([A-Za-z0-9_-]+):\s*([^\s#]+)\s*(#.*)?$/);
  if (!permMatch) return false;
  const key = permMatch[1];
  const value = parsePermissionValue(permMatch[2]);
  result.jobs[state.currentJob].permissions[key] = value;
  const hasJustification =
    Boolean(permMatch[3]) && /justification/i.test(permMatch[3]);
  result.jobs[state.currentJob].permissionsMeta[key] = { hasJustification };
  return true;
}

function handleStepsStart(state, line) {
  if (!state.currentJob || !/^\s{4}steps\s*:/.test(line)) return false;
  state.inSteps = true;
  return true;
}

function startRunBlock(state, value, indent) {
  if (value === '|' || value === '>') {
    state.inRunBlock = true;
    state.runBlockIndent = indent;
    return true;
  }
  return false;
}

function handleStepStart(state, result, line, lineNumber, indent) {
  if (!state.inSteps) return false;
  const stepStart = line.match(/^\s{6}-\s*(.*)$/);
  if (!stepStart) return false;

  finishStep(state, result);

  const dashCol = Math.max(1, line.indexOf('-', indent) + 1);
  state.currentStep = {
    name: '',
    id: '',
    uses: '',
    usesColumn: null,
    run: '',
    runLines: [],
    runLineNumbers: [],
    runLineColumns: [],
    with: {},
    withLineNumbers: [],
    withLineColumns: [],
    lines: [line],
    lineNumbers: [lineNumber],
    lineColumns: [dashCol],
    startLine: lineNumber,
    startColumn: dashCol,
  };

  const rest = stepStart[1];
  const nameMatch = rest.match(/^name:\s*(.+)$/);
  const idMatch = rest.match(/^id:\s*(.+)$/);
  const usesMatch = rest.match(/^uses:\s*([^\s#]+)/);
  const runMatch = rest.match(/^run:\s*(.+)$/);
  if (nameMatch) state.currentStep.name = nameMatch[1];
  if (idMatch) state.currentStep.id = idMatch[1];
  if (usesMatch) {
    state.currentStep.uses = usesMatch[1];
    state.currentStep.usesColumn = line.indexOf(usesMatch[1]) + 1;
  }
  if (runMatch) {
    const value = runMatch[1];
    if (!startRunBlock(state, value, 6)) {
      state.currentStep.run = value;
      state.currentStep.runLines = [value];
      state.currentStep.runLineNumbers = [lineNumber];
      state.currentStep.runLineColumns = [line.indexOf(value) + 1];
    }
  }
  return true;
}

function handleStepContinuation(state, line, indent, lineNumber) {
  if (!state.currentStep) return false;

  state.currentStep.lines.push(line);
  state.currentStep.lineNumbers.push(lineNumber);
  state.currentStep.lineColumns.push(indent + 1);
  const nameMatch = line.match(/^\s{8}name:\s*(.+)$/);
  if (nameMatch) state.currentStep.name = nameMatch[1];

  const idMatch = line.match(/^\s{8}id:\s*(.+)$/);
  if (idMatch) state.currentStep.id = idMatch[1];

  const usesMatch = line.match(/^\s{8}uses:\s*([^\s#]+)/);
  if (usesMatch) {
    state.currentStep.uses = usesMatch[1];
    state.currentStep.usesColumn = line.indexOf(usesMatch[1]) + 1;
  }

  const runMatch = line.match(/^\s{8}run:\s*(.*)$/);
  if (runMatch) {
    const value = runMatch[1];
    if (!startRunBlock(state, value, 8)) {
      state.currentStep.run = value;
      state.currentStep.runLines = [value];
      state.currentStep.runLineNumbers = [lineNumber];
      state.currentStep.runLineColumns = [line.indexOf(value) + 1];
    }
    return true;
  }

  if (state.inRunBlock && indent > state.runBlockIndent) {
    const content = line.slice(state.runBlockIndent + 2);
    state.currentStep.runLines.push(content);
    state.currentStep.runLineNumbers.push(lineNumber);
    state.currentStep.runLineColumns.push(indent + 1);
    state.currentStep.run = state.currentStep.runLines.join('\n');
    return true;
  }

  if (/^\s{8}with\s*:/.test(line)) {
    state.inWith = true;
    state.withIndent = 8;
    return true;
  }

  if (state.inWith && indent > state.withIndent) {
    const withMatch = line.match(/^\s{10}([A-Za-z0-9_-]+):\s*(.+)\s*$/);
    if (withMatch) {
      state.currentStep.with[withMatch[1]] = withMatch[2];
      state.currentStep.withLineNumbers.push(lineNumber);
      state.currentStep.withLineColumns.push(line.indexOf(withMatch[2]) + 1);
      return true;
    }
  }
  return false;
}

export function parseWorkflow(raw) {
  const lines = raw.split(/\r?\n/);
  const result = createResult();
  const state = createState();
  let parsedDoc = null;
  try {
    parsedDoc = yaml.parse(raw);
    applyTriggersFromDoc(result, parsedDoc);
  } catch {
    // Fall back to the line-based parser if YAML parsing fails.
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    const indent = line.match(/^(\s*)/)[1].length;

    updateStateOnIndent(state, indent);

    if (!trimmed || trimmed.startsWith('#')) continue;

    handleInlineOn(result, line);
    handleOnStart(state, line, indent);
    handleOnTrigger(state, result, line);

    if (handleWorkflowPermsStart(state, result, line, indent)) continue;
    if (handleWorkflowPermsLine(state, result, line)) continue;

    if (handleJobsStart(state, line)) continue;
    if (handleJobStart(state, result, line, lineNumber)) continue;
    if (handleJobPermsStart(state, result, line, indent)) continue;
    if (handleJobPermsLine(state, result, line)) continue;
    if (handleStepsStart(state, line)) continue;

    if (handleStepStart(state, result, line, lineNumber, indent)) continue;
    handleStepContinuation(state, line, indent, lineNumber);
  }

  finishStep(state, result);

  if (/\s[&*][A-Za-z0-9_-]+/.test(raw)) {
    result.parseWarnings.push({
      code: 'YAML_ALIAS',
      message:
        'YAML anchor/alias detected; line-based parsing may miss overrides.',
    });
  }

  if (parsedDoc && typeof parsedDoc === 'object' && parsedDoc.jobs) {
    for (const [jobId, job] of Object.entries(parsedDoc.jobs)) {
      const docSteps = Array.isArray(job?.steps) ? job.steps.length : 0;
      const parsedSteps = result.jobs[jobId]?.steps?.length || 0;
      if (docSteps !== parsedSteps) {
        result.parseWarnings.push({
          code: 'STEP_COUNT_MISMATCH',
          message: `Step count mismatch for job '${jobId}': yaml=${docSteps} parsed=${parsedSteps}`,
        });
      }
    }
  }

  return result;
}

export function workflowKeyFromPath(relPath) {
  const base = path.basename(relPath);
  if (base.endsWith('.yml')) return base.slice(0, -4);
  if (base.endsWith('.yaml')) return base.slice(0, -5);
  return base;
}

export function extractUploadPaths(step) {
  const directPath = step.with?.path
    ? String(step.with.path).replaceAll('"', '')
    : '';
  if (directPath && directPath !== '|' && directPath !== '>') {
    return [directPath];
  }
  const paths = [];
  let inPath = false;
  let pathIndent = 0;

  for (const line of step.lines) {
    const indent = line.match(/^(\s*)/)[1].length;
    if (inPath && indent <= pathIndent) {
      inPath = false;
    }
    if (/^\s{8,}path\s*:/.test(line)) {
      const match = line.match(/^\s{8,}path\s*:\s*(.+)?$/);
      pathIndent = indent;
      if (match?.[1] && match[1] !== '|' && match[1] !== '>') {
        paths.push(match[1].trim());
        inPath = false;
      } else {
        inPath = true;
      }
      continue;
    }
    if (inPath && indent > pathIndent) {
      const val = line.trim();
      if (val) paths.push(val);
    }
  }
  return paths;
}

export function isActionUpload(uses) {
  return (
    uses === './.github/actions/ps-upload-artifacts' ||
    uses.startsWith('actions/upload-artifact@')
  );
}
