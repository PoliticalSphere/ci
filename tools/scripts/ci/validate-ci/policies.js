// ==============================================================================
// Political Sphere — Validate-CI Policy Loaders
// ------------------------------------------------------------------------------
// Purpose:
//   Load policy configuration files with minimal parsing logic.
// ==============================================================================

import fs from 'node:fs';

import { fatal } from './console.js';

function isValidLine(line) {
  const trimmed = line.trim();
  return trimmed && !trimmed.startsWith('#');
}

function isStartMarker(line, startMarker) {
  const trimmed = line.trim();
  return trimmed === `${startMarker}:` || /^\s*allowlist\s*:/.test(line);
}

function parseId(line) {
  const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z\d_-]+)/);
  return idMatch ? idMatch[1] : null;
}

function parseStatus(line) {
  const statusMatch = line.match(/^\s*status:\s*([A-Za-z\d_-]+)/);
  return statusMatch ? statusMatch[1] : null;
}

function parseSelector(line) {
  const selMatch = line.match(
    /^\s*(workflow_path|job_id|step_id|step_name):\s*(.+)\s*$/,
  );
  if (!selMatch) return null;
  const selectorKey = selMatch[1];
  const selectorValue = selMatch[2];
  return { key: selectorKey, value: selectorValue };
}

function shouldAddEntry(entry, entryHasStatus) {
  if (!entryHasStatus) return true;
  const status = entry.status || 'active';
  return status === 'active';
}

function parseSelectorEntries(text, startMarker = 'allowlist', opts = {}) {
  const { entryHasStatus = false } = opts;
  const entries = [];
  const state = {
    current: null,
    inSection: false,
    inSelector: false,
    entryHasStatus,
  };

  for (const line of text.split(/\r?\n/)) {
    if (!isValidLine(line)) continue;
    processSelectorEntryLine(state, entries, line, startMarker);
  }

  finalizeSelectorEntry(entries, state.current, entryHasStatus);
  return entries;
}

function finalizeSelectorEntry(entries, current, entryHasStatus) {
  if (current && shouldAddEntry(current, entryHasStatus)) {
    entries.push(current);
  }
}

function processSelectorEntryLine(state, entries, line, startMarker) {
  if (!state.inSection) {
    if (isStartMarker(line, startMarker)) {
      state.inSection = true;
    }
    return;
  }

  const id = parseId(line);
  if (id) {
    finalizeSelectorEntry(entries, state.current, state.entryHasStatus);
    state.current = { id, selector: {} };
    if (state.entryHasStatus) state.current.status = '';
    state.inSelector = false;
    return;
  }

  if (!state.current) return;

  if (state.entryHasStatus) {
    const status = parseStatus(line);
    if (status) {
      state.current.status = status;
      return;
    }
  }

  if (line.trim() === 'selector:') {
    state.inSelector = true;
    return;
  }

  if (!state.inSelector) return;

  const selectorEntry = parseSelector(line);
  if (selectorEntry) {
    state.current.selector[selectorEntry.key] = selectorEntry.value;
  }
}

export function permissionLevel(permissionValue) {
  if (permissionValue === 'none') return 0;
  if (permissionValue === 'read') return 1;
  if (permissionValue === 'write') return 2;
  return -1;
}

function parseRepoEntry(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- repo:')) return null;
  const repoEntryValue = trimmed.slice('- repo:'.length).trim();
  if (!repoEntryValue) return null;
  const slashIndex = repoEntryValue.indexOf('/');
  if (slashIndex <= 0 || slashIndex === repoEntryValue.length - 1) return null;
  const owner = repoEntryValue.slice(0, slashIndex);
  const repo = repoEntryValue.slice(slashIndex + 1);
  const validPart = (s) => /^[A-Za-z0-9_. -]+$/.test(s);
  if (!validPart(owner) || !validPart(repo)) return null;
  return `${owner}/${repo}`;
}

function parseAllowed(line) {
  const allowedMatch = line.match(/^\s*allowed:\s*(true|false)\s*$/);
  return allowedMatch ? allowedMatch[1] === 'true' : null;
}

export function loadAllowlist(filePath) {
  const allow = new Set();
  if (!fs.existsSync(filePath)) {
    fatal(`actions allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const state = { currentRepo: '', currentAllowed: true, inEntry: false };

  for (const line of text.split(/\r?\n/)) {
    if (!isValidLine(line)) continue;
    processAllowlistLine(state, allow, line);
  }

  finalizeAllowlistEntry(state, allow);
  return allow;
}

function processAllowlistLine(state, allow, line) {
  const repo = parseRepoEntry(line);
  if (repo) {
    finalizeAllowlistEntry(state, allow);
    state.currentRepo = repo;
    state.currentAllowed = true;
    state.inEntry = true;
    return;
  }

  if (!state.inEntry) return;

  const allowed = parseAllowed(line);
  if (allowed !== null) {
    state.currentAllowed = allowed;
  }
}

function finalizeAllowlistEntry(state, allow) {
  if (state.inEntry && state.currentRepo && state.currentAllowed) {
    allow.add(state.currentRepo);
  }
}

export function loadInlineAllowlist(filePath) {
  if (!fs.existsSync(filePath)) {
    fatal(`inline bash allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  return parseSelectorEntries(text, 'allowlist', { entryHasStatus: true });
}

function getIndent(line) {
  return line.match(/^(\s*)/)[1].length;
}

function shouldExitSection(currentIndent, sectionIndent, sectionName, trimmed) {
  return currentIndent <= sectionIndent && trimmed !== sectionName;
}

function resetAllSections() {
  return {
    inGlobal: false,
    inForbid: false,
    inRequire: false,
    inRunRegex: false,
    inRequireAll: false,
  };
}

function parseSectionStart(line) {
  const trimmed = line.trim();
  if (trimmed === 'global:') return { type: 'global', indent: getIndent(line) };
  if (trimmed === 'forbid:') return { type: 'forbid', indent: getIndent(line) };
  if (trimmed === 'require:')
    return { type: 'require', indent: getIndent(line) };
  return null;
}

function parseSubSection(line, inForbid, inRequire) {
  const trimmed = line.trim();
  if (inForbid && trimmed === 'run_regex:') {
    return { type: 'run_regex', indent: getIndent(line) };
  }
  if (inRequire && trimmed === 'run_contains_all:') {
    return { type: 'run_contains_all', indent: getIndent(line) };
  }
  return null;
}

function parseRegexEntry(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('- ')) {
    // Use explicit substring handling so this function's implementation
    // is distinct from `cleanRegexEntry` while preserving behavior.
    let regexEntry = trimmed.slice(2).trim();
    if (
      (regexEntry.startsWith('"') && regexEntry.endsWith('"')) ||
      (regexEntry.startsWith("'") && regexEntry.endsWith("'"))
    ) {
      regexEntry = regexEntry.slice(1, -1);
    }
    return regexEntry;
  }
  return null;
}

function updateSectionStates(states, lineIndent, sectionIndents, trimmed) {
  const { inGlobal, inForbid, inRequire, inRunRegex, inRequireAll } = states;
  const newStates = { ...states };

  if (
    inGlobal &&
    shouldExitSection(
      lineIndent,
      sectionIndents.globalIndent,
      'global:',
      trimmed,
    )
  ) {
    newStates.inGlobal = false;
  }
  if (
    inForbid &&
    shouldExitSection(
      lineIndent,
      sectionIndents.forbidIndent,
      'forbid:',
      trimmed,
    )
  ) {
    newStates.inForbid = false;
    newStates.inRunRegex = false;
  }
  if (
    inRequire &&
    shouldExitSection(
      lineIndent,
      sectionIndents.requireIndent,
      'require:',
      trimmed,
    )
  ) {
    newStates.inRequire = false;
    newStates.inRequireAll = false;
  }
  if (
    inRunRegex &&
    shouldExitSection(lineIndent, sectionIndents.runRegexIndent, '- ', trimmed)
  ) {
    newStates.inRunRegex = false;
  }
  if (
    inRequireAll &&
    shouldExitSection(
      lineIndent,
      sectionIndents.requireAllIndent,
      '- ',
      trimmed,
    )
  ) {
    newStates.inRequireAll = false;
  }

  return newStates;
}

export function loadInlineConstraints(filePath) {
  if (!fs.existsSync(filePath)) {
    fatal(`inline bash allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const state = initInlineConstraintsState();

  for (const line of text.split(/\r?\n/)) {
    if (!isValidLine(line)) continue;
    if (processInlineConstraintsLine(state, line)) break;
  }

  return {
    forbidRegex: state.forbidRegex,
    requireContains: state.requireContains,
  };
}

function initInlineConstraintsState() {
  return {
    forbidRegex: [],
    requireContains: [],
    inConstraints: false,
    constraintsIndent: 0,
    sectionIndents: {
      globalIndent: 0,
      forbidIndent: 0,
      requireIndent: 0,
      runRegexIndent: 0,
      requireAllIndent: 0,
    },
    states: resetAllSections(),
  };
}

function processInlineConstraintsLine(state, line) {
  const trimmed = line.trim();
  const lineIndent = getIndent(line);

  if (lineIndent === 0 && trimmed === 'allowlist:') return true;
  if (lineIndent === 0 && trimmed === 'constraints:') {
    state.inConstraints = true;
    state.constraintsIndent = lineIndent;
    state.states = resetAllSections();
    return false;
  }

  if (!state.inConstraints) return false;

  if (lineIndent <= state.constraintsIndent && trimmed !== 'constraints:') {
    state.inConstraints = false;
    state.states = resetAllSections();
    return false;
  }

  state.states = updateSectionStates(
    state.states,
    lineIndent,
    state.sectionIndents,
    trimmed,
  );

  if (handleSectionStart(state, line)) return false;
  if (handleSubSectionStart(state, line)) return false;
  appendInlineRegexEntry(state, line);
  return false;
}

function handleSectionStart(state, line) {
  const sectionStart = parseSectionStart(line);
  if (!sectionStart) return false;
  if (sectionStart.type === 'global') {
    state.states.inGlobal = true;
    state.sectionIndents.globalIndent = sectionStart.indent;
    return true;
  }
  if (sectionStart.type === 'forbid') {
    state.states.inForbid = true;
    state.sectionIndents.forbidIndent = sectionStart.indent;
    state.states.inRequire = false;
    return true;
  }
  if (sectionStart.type === 'require') {
    state.states.inRequire = true;
    state.sectionIndents.requireIndent = sectionStart.indent;
    state.states.inForbid = false;
    return true;
  }
  return false;
}

function handleSubSectionStart(state, line) {
  const subSection = parseSubSection(
    line,
    state.states.inForbid,
    state.states.inRequire,
  );
  if (!subSection) return false;
  if (subSection.type === 'run_regex') {
    state.states.inRunRegex = true;
    state.sectionIndents.runRegexIndent = subSection.indent;
    return true;
  }
  if (subSection.type === 'run_contains_all') {
    state.states.inRequireAll = true;
    state.sectionIndents.requireAllIndent = subSection.indent;
    return true;
  }
  return false;
}

function appendInlineRegexEntry(state, line) {
  const regexEntry = parseRegexEntry(line);
  if (regexEntry === null) return;
  if (state.states.inRunRegex) {
    state.forbidRegex.push(regexEntry);
  } else if (state.states.inRequireAll) {
    state.requireContains.push(regexEntry);
  }
}

function parsePatternId(line) {
  const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z\d_-]+)/);
  return idMatch ? idMatch[1] : null;
}

function parseUses(line) {
  // Allow 'owner/repo' or 'owner/repo/subpath'. Validate owner/repo parts explicitly
  // and return the original value to preserve any additional subpath.
  const trimmed = line.trim();
  if (!trimmed.startsWith('uses:')) return null;
  const usesValue = trimmed.slice('uses:'.length).trim();
  if (!usesValue) return null;
  const parts = usesValue.split('/');
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1];
  if (!/^[A-Za-z0-9_. -]+$/.test(owner) || !/^[A-Za-z0-9_. -]+$/.test(repo)) {
    return null;
  }
  return usesValue;
}

function parseEnabled(line) {
  const enabledMatch = line.match(/^\s*enabled:\s*(true|false)\s*$/);
  return enabledMatch ? enabledMatch[1] === 'true' : null;
}

function parseWithEntry(line) {
  const trimmed = line.trim();
  const colon = trimmed.indexOf(':');
  if (colon <= 0) return null;
  const withKey = trimmed.slice(0, colon).trim();
  const withValue = trimmed.slice(colon + 1).trim();
  if (!withKey || !withValue) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(withKey)) return null;
  if (!/^[A-Za-z0-9_. -]+$/.test(withValue)) return null;
  return { key: withKey, value: withValue };
}

function cleanRegexEntry(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('- ')) {
    // Use replaceAll with grouped alternation to make operator precedence explicit.
    return trimmed.replaceAll(/^- /g, '').replaceAll(/(^"|"$)/g, '');
  }
  return null;
}

export function loadUnsafePatterns(filePath) {
  const patterns = [];
  if (!fs.existsSync(filePath)) {
    fatal(`unsafe patterns file not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const state = initUnsafePatternState();

  for (const line of text.split(/\r?\n/)) {
    handleUnsafePatternLine(state, patterns, line);
  }

  finalizeUnsafePattern(state, patterns);
  return patterns;
}

function initUnsafePatternState() {
  return {
    current: null,
    inRunRegex: false,
    inWith: false,
    enabled: true,
  };
}

function finalizeUnsafePattern(state, patterns) {
  if (state.current && state.enabled) {
    patterns.push(state.current);
  }
}

function handleUnsafePatternLine(state, patterns, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  if (startUnsafePatternEntry(state, patterns, line)) return;
  if (!state.current) return;
  if (handleUnsafePatternUses(state, line)) return;
  if (handleUnsafePatternSection(state, trimmed)) return;
  if (handleUnsafePatternEnabled(state, line)) return;
  handleUnsafePatternRegexEntry(state, line);
  handleUnsafePatternWithEntry(state, line);
}

function startUnsafePatternEntry(state, patterns, line) {
  const id = parsePatternId(line);
  if (!id) return false;
  finalizeUnsafePattern(state, patterns);
  state.current = { id, runRegex: [], uses: '', with: {} };
  state.inRunRegex = false;
  state.inWith = false;
  state.enabled = true;
  return true;
}

function handleUnsafePatternUses(state, line) {
  const uses = parseUses(line);
  if (!uses) return false;
  state.current.uses = uses;
  return true;
}

function handleUnsafePatternSection(state, trimmed) {
  if (trimmed === 'run_regex:') {
    state.inRunRegex = true;
    state.inWith = false;
    return true;
  }
  if (trimmed === 'with:') {
    state.inWith = true;
    state.inRunRegex = false;
    return true;
  }
  return false;
}

function handleUnsafePatternEnabled(state, line) {
  const isEnabled = parseEnabled(line);
  if (isEnabled === null) return false;
  state.enabled = isEnabled;
  return true;
}

function handleUnsafePatternRegexEntry(state, line) {
  if (!state.inRunRegex) return;
  const regexEntry = cleanRegexEntry(line);
  if (regexEntry !== null) {
    state.current.runRegex.push(regexEntry);
  }
}

function handleUnsafePatternWithEntry(state, line) {
  if (!state.inWith) return;
  const withEntry = parseWithEntry(line);
  if (withEntry) {
    state.current.with[withEntry.key] = withEntry.value;
  }
}

export function loadUnsafeAllowlist(filePath) {
  if (!fs.existsSync(filePath)) {
    fatal(`unsafe patterns allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  return parseSelectorEntries(text, 'allowlist', { entryHasStatus: false });
}

function parseHighRiskId(line) {
  const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z\d_-]+)/);
  return idMatch ? idMatch[1] : null;
}

function parseHighRiskStatus(line) {
  const statusMatch = line.match(/^\s*status:\s*([A-Za-z\d_-]+)/);
  return statusMatch ? statusMatch[1] : null;
}

function parseWorkflow(line) {
  const wfMatch = line.match(/^\s*workflow:\s*(.+)\s*$/);
  return wfMatch ? wfMatch[1] : null;
}

function parseTrigger(line) {
  const trigMatch = line.match(/^\s*trigger:\s*([A-Za-z\d_-]+)\s*$/);
  return trigMatch ? trigMatch[1] : null;
}

function parseWorkflowPath(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('workflow_path:')) return null;
  let workflowPathValue = trimmed.slice('workflow_path:'.length).trim();
  if (!workflowPathValue) return null;
  if (
    (workflowPathValue.startsWith('"') &&
      workflowPathValue.endsWith('"')) ||
    (workflowPathValue.startsWith("'") &&
      workflowPathValue.endsWith("'"))
  ) {
    workflowPathValue = workflowPathValue.slice(1, -1).trim();
  }
  return workflowPathValue || null;
}

function shouldProcessEntry(current, status) {
  return current?.workflow && current?.trigger && status !== 'retired';
}

function addToAllowlist(allowlist, current, status) {
  if (shouldProcessEntry(current, status)) {
    const set = allowlist.get(current.workflow) || new Set();
    set.add(current.trigger);
    allowlist.set(current.workflow, set);
  }
}

function updateSelectorState(inSelector, indent, selectorIndent, trimmed) {
  if (inSelector && indent <= selectorIndent && trimmed !== 'selector:') {
    return false;
  }
  return inSelector;
}

export function loadHighRiskTriggers(filePath) {
  if (!fs.existsSync(filePath)) {
    fatal(`high-risk triggers allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const state = initHighRiskState();

  for (const line of text.split(/\r?\n/)) {
    handleHighRiskLine(state, line);
  }

  finalizeHighRiskAllowlist(state);
  return { triggers: state.triggers, allowlist: state.allowlist };
}

function initHighRiskState() {
  return {
    triggers: new Set(),
    allowlist: new Map(),
    inHighRisk: false,
    inAllowlist: false,
    inSelector: false,
    selectorIndent: 0,
    current: null,
  };
}

function finalizeHighRiskAllowlist(state) {
  addToAllowlist(state.allowlist, state.current, state.current?.status);
}

function handleHighRiskLine(state, line) {
  const trimmed = line.trim();
  const indent = line.match(/^(\s*)/)[1].length;
  if (!trimmed || trimmed.startsWith('#')) return;
  if (handleHighRiskSectionStart(state, trimmed)) return;
  if (handleHighRiskTriggersEntry(state, trimmed)) return;
  handleHighRiskAllowlistEntry(state, line, trimmed, indent);
}

function handleHighRiskSectionStart(state, trimmed) {
  if (trimmed === 'high_risk_triggers:') {
    state.inHighRisk = true;
    state.inAllowlist = false;
    state.inSelector = false;
    return true;
  }
  if (trimmed === 'allowlist:') {
    state.inAllowlist = true;
    state.inHighRisk = false;
    state.inSelector = false;
    return true;
  }
  return false;
}

function handleHighRiskTriggersEntry(state, trimmed) {
  if (!state.inHighRisk) return false;
  if (!trimmed.startsWith('- ')) return false;
  state.triggers.add(trimmed.replaceAll(/^- /g, ''));
  return true;
}

function handleHighRiskAllowlistEntry(state, line, trimmed, indent) {
  if (!state.inAllowlist) return;
  if (startHighRiskAllowlistEntry(state, line)) return;
  if (!state.current) return;
  updateHighRiskSelectorState(state, indent, trimmed);
  if (handleHighRiskSelectorStart(state, trimmed, indent)) return;
  applyHighRiskEntryFields(state, line);
  if (state.inSelector) {
    applyHighRiskSelectorFields(state, line);
  }
}

function startHighRiskAllowlistEntry(state, line) {
  const id = parseHighRiskId(line);
  if (!id) return false;
  addToAllowlist(state.allowlist, state.current, state.current?.status);
  state.current = {
    id,
    workflow: '',
    trigger: '',
    status: 'active',
  };
  state.inSelector = false;
  return true;
}

function updateHighRiskSelectorState(state, indent, trimmed) {
  state.inSelector = updateSelectorState(
    state.inSelector,
    indent,
    state.selectorIndent,
    trimmed,
  );
}

function handleHighRiskSelectorStart(state, trimmed, indent) {
  if (trimmed !== 'selector:') return false;
  state.inSelector = true;
  state.selectorIndent = indent;
  return true;
}

function applyHighRiskEntryFields(state, line) {
  const status = parseHighRiskStatus(line);
  if (status) state.current.status = status;
  const workflow = parseWorkflow(line);
  if (workflow) state.current.workflow = workflow;
  const trigger = parseTrigger(line);
  if (trigger) state.current.trigger = trigger;
}

function applyHighRiskSelectorFields(state, line) {
  const workflowPath = parseWorkflowPath(line);
  if (workflowPath) {
    state.current.workflow = workflowPath;
  }
}

function parseUnspecified(line) {
  const dMatch = line.match(/^\s*unspecified:\s*(none|read|write)\s*$/);
  return dMatch ? dMatch[1] : null;
}

function parseUnspecifiedPermission(line) {
  const dMatch = line.match(
    /^\s*unspecified_permission:\s*(none|read|write)\s*$/,
  );
  return dMatch ? dMatch[1] : null;
}

function parseWorkflowName(line) {
  const wfMatch = line.match(/^\s{2}([a-z\d-]+):\s*$/);
  return wfMatch ? wfMatch[1] : null;
}

function isBaselineLine(line) {
  return /^\s{4}baseline\s*:/.test(line);
}

function parsePermission(line) {
  const permMatch = line.match(
    /^\s{4}([A-Za-z\d_-]+):\s*(none|read|write)\s*$/,
  );
  if (!permMatch) return null;
  const permissionKey = permMatch[1];
  const permissionValue = permMatch[2];
  return { key: permissionKey, value: permissionValue };
}

function parseBaselinePermission(line) {
  const permMatch = line.match(
    /^\s{6}([A-Za-z\d_-]+):\s*(none|read|write)\s*$/,
  );
  if (!permMatch) return null;
  const permissionKey = permMatch[1];
  const permissionValue = permMatch[2];
  return { key: permissionKey, value: permissionValue };
}

export function loadPermissionsBaseline(filePath) {
  const baseline = { defaults: { unspecified: 'none' }, workflows: {} };
  if (!fs.existsSync(filePath)) {
    fatal(`permissions baseline not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const state = initPermissionsBaselineState();

  for (const line of text.split(/\r?\n/)) {
    handlePermissionsBaselineLine(state, baseline, line);
  }

  return baseline;
}

function initPermissionsBaselineState() {
  return {
    inDefaults: false,
    inPolicy: false,
    inWorkflows: false,
    inBaseline: false,
    current: '',
  };
}

function handlePermissionsBaselineLine(state, baseline, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  if (handlePermissionsSectionStart(state, trimmed)) return;
  if (state.inDefaults) {
    applyPermissionsDefaults(baseline, line);
  }
  if (state.inPolicy) {
    applyPermissionsPolicy(baseline, line);
  }
  if (state.inWorkflows) {
    applyPermissionsWorkflow(state, baseline, line);
  }
}

function handlePermissionsSectionStart(state, trimmed) {
  if (trimmed === 'defaults:') {
    state.inDefaults = true;
    state.inPolicy = false;
    state.inWorkflows = false;
    return true;
  }
  if (trimmed === 'policy:') {
    state.inPolicy = true;
    state.inDefaults = false;
    state.inWorkflows = false;
    return true;
  }
  if (trimmed === 'workflows:') {
    state.inWorkflows = true;
    state.inDefaults = false;
    state.inPolicy = false;
    return true;
  }
  return false;
}

function applyPermissionsDefaults(baseline, line) {
  const unspecified = parseUnspecified(line);
  if (unspecified) {
    baseline.defaults.unspecified = unspecified;
  }
}

function applyPermissionsPolicy(baseline, line) {
  const unspecifiedPermission = parseUnspecifiedPermission(line);
  if (unspecifiedPermission) {
    baseline.defaults.unspecified = unspecifiedPermission;
  }
}

function applyPermissionsWorkflow(state, baseline, line) {
  if (startWorkflowEntry(state, baseline, line)) return;
  if (startWorkflowBaseline(state, line)) return;
  if (state.current && state.inBaseline) {
    applyWorkflowBaselinePermission(state, baseline, line);
    return;
  }
  applyWorkflowPermission(state, baseline, line);
}

function startWorkflowEntry(state, baseline, line) {
  const wfName = parseWorkflowName(line);
  if (!wfName) return false;
  state.current = wfName;
  if (!baseline.workflows[state.current]) {
    baseline.workflows[state.current] = {};
  }
  state.inBaseline = false;
  return true;
}

function startWorkflowBaseline(state, line) {
  if (!state.current || !isBaselineLine(line)) return false;
  state.inBaseline = true;
  return true;
}

function applyWorkflowBaselinePermission(state, baseline, line) {
  const baselinePermission = parseBaselinePermission(line);
  if (baselinePermission) {
    baseline.workflows[state.current][baselinePermission.key] =
      baselinePermission.value;
  }
}

function applyWorkflowPermission(state, baseline, line) {
  const permissionEntry = parsePermission(line);
  if (permissionEntry && state.current) {
    baseline.workflows[state.current][permissionEntry.key] =
      permissionEntry.value;
  }
}

function parseRetentionDays(trimmed) {
  if (trimmed.startsWith('default_retention_days:')) {
    const match = trimmed.match(/default_retention_days:\s*(\d+)/);
    return match ? Number(match[1]) : null;
  }
  return null;
}

function parseRequiredPath(trimmed) {
  if (trimmed.startsWith('- ')) {
    return trimmed.replaceAll(/^- /g, '');
  }
  return null;
}

function parseArtifactWorkflowName(line) {
  const wfMatch = line.match(/^\s{2}([a-z\d-]+):\s*$/);
  return wfMatch ? wfMatch[1] : null;
}

function parseArtifactName(line) {
  const nameMatch = line.match(/^\s{4}-\s*name:\s*(.+)\s*$/);
  return nameMatch ? nameMatch[1] : null;
}

function updateArtifactSectionStates(inRequired, inAllowlist, trimmed) {
  if (trimmed === 'required_paths:') {
    return { inRequired: true, inAllowlist: false };
  }
  if (trimmed === 'allowlist:') {
    return { inAllowlist: true, inRequired: false };
  }
  return { inRequired, inAllowlist };
}

export function loadArtifactPolicy(filePath) {
  const policy = {
    requiredPaths: [],
    allowlist: new Map(),
    defaultRetention: 7,
  };
  if (!fs.existsSync(filePath)) {
    fatal(`artifact policy not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const state = initArtifactPolicyState();

  for (const line of text.split(/\r?\n/)) {
    handleArtifactPolicyLine(state, policy, line);
  }

  return policy;
}

function initArtifactPolicyState() {
  return {
    inRequired: false,
    inAllowlist: false,
    current: '',
  };
}

function handleArtifactPolicyLine(state, policy, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  applyArtifactSectionState(state, trimmed);
  applyArtifactRetention(policy, trimmed);
  applyArtifactRequiredPath(state, policy, trimmed);
  applyArtifactAllowlistEntry(state, policy, line);
}

function applyArtifactSectionState(state, trimmed) {
  const sectionStates = updateArtifactSectionStates(
    state.inRequired,
    state.inAllowlist,
    trimmed,
  );
  state.inRequired = sectionStates.inRequired;
  state.inAllowlist = sectionStates.inAllowlist;
}

function applyArtifactRetention(policy, trimmed) {
  const retentionDays = parseRetentionDays(trimmed);
  if (retentionDays !== null) {
    policy.defaultRetention = retentionDays;
  }
}

function applyArtifactRequiredPath(state, policy, trimmed) {
  const requiredPath = parseRequiredPath(trimmed);
  if (requiredPath !== null && state.inRequired) {
    policy.requiredPaths.push(requiredPath);
  }
}

function applyArtifactAllowlistEntry(state, policy, line) {
  if (!state.inAllowlist) return;
  if (startArtifactAllowlistWorkflow(state, policy, line)) return;
  addArtifactAllowlistName(state, policy, line);
}

function startArtifactAllowlistWorkflow(state, policy, line) {
  const wfName = parseArtifactWorkflowName(line);
  if (!wfName) return false;
  state.current = wfName;
  if (!policy.allowlist.has(state.current)) {
    policy.allowlist.set(state.current, new Set());
  }
  return true;
}

function addArtifactAllowlistName(state, policy, line) {
  const artifactName = parseArtifactName(line);
  if (artifactName && state.current) {
    policy.allowlist.get(state.current).add(artifactName);
  }
}
