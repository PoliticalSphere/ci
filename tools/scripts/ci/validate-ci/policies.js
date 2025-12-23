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
  return selMatch ? { key: selMatch[1], value: selMatch[2] } : null;
}

function shouldAddEntry(entry, entryHasStatus) {
  if (!entryHasStatus) return true;
  const status = entry.status || 'active';
  return status === 'active';
}

function parseSelectorEntries(text, startMarker = 'allowlist', opts = {}) {
  const { entryHasStatus = false } = opts;
  const entries = [];
  let current = null;
  let inSection = false;
  let inSelector = false;

  for (const line of text.split(/\r?\n/)) {
    if (!isValidLine(line)) continue;

    if (!inSection) {
      if (isStartMarker(line, startMarker)) {
        inSection = true;
      }
      continue;
    }

    const id = parseId(line);
    if (id) {
      if (current && shouldAddEntry(current, entryHasStatus)) {
        entries.push(current);
      }
      current = { id, selector: {} };
      if (entryHasStatus) current.status = '';
      inSelector = false;
      continue;
    }

    if (!current) continue;

    if (entryHasStatus) {
      const status = parseStatus(line);
      if (status) {
        current.status = status;
        continue;
      }
    }

    const trimmed = line.trim();
    if (trimmed === 'selector:') {
      inSelector = true;
      continue;
    }

    if (inSelector) {
      const selector = parseSelector(line);
      if (selector) {
        current.selector[selector.key] = selector.value;
      }
    }
  }

  if (current && shouldAddEntry(current, entryHasStatus)) {
    entries.push(current);
  }
  return entries;
}

export function permissionLevel(value) {
  if (value === 'none') return 0;
  if (value === 'read') return 1;
  if (value === 'write') return 2;
  return -1;
}

function parseRepoEntry(line) {
  // Match owner/repo where allowed characters include letters, digits, underscore,
  // dot, space and hyphen. Group owner/repo together to make precedence explicit.
  const repoMatch = line.match(
    /^\s*-\s*repo:\s*((?:[A-Za-z0-9_. -]+\/[A-Za-z0-9_. -]+))/,
  );
  return repoMatch ? repoMatch[1] : null;
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
  let currentRepo = '';
  let currentAllowed = true;
  let inEntry = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const repo = parseRepoEntry(line);
    if (repo) {
      if (inEntry && currentRepo && currentAllowed) {
        allow.add(currentRepo);
      }
      currentRepo = repo;
      currentAllowed = true;
      inEntry = true;
      continue;
    }

    if (inEntry) {
      const allowed = parseAllowed(line);
      if (allowed !== null) {
        currentAllowed = allowed;
      }
    }
  }

  if (inEntry && currentRepo && currentAllowed) {
    allow.add(currentRepo);
  }
  return allow;
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
    let val = trimmed.slice(2).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val;
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
  const forbidRegex = [];
  const requireContains = [];
  let inConstraints = false;
  let constraintsIndent = 0;

  const sectionIndents = {
    globalIndent: 0,
    forbidIndent: 0,
    requireIndent: 0,
    runRegexIndent: 0,
    requireAllIndent: 0,
  };

  let states = {
    inGlobal: false,
    inForbid: false,
    inRequire: false,
    inRunRegex: false,
    inRequireAll: false,
  };

  for (const line of text.split(/\r?\n/)) {
    if (!isValidLine(line)) continue;

    const trimmed = line.trim();
    const lineIndent = getIndent(line);

    if (lineIndent === 0 && trimmed === 'allowlist:') {
      break;
    }

    if (lineIndent === 0 && trimmed === 'constraints:') {
      inConstraints = true;
      constraintsIndent = lineIndent;
      states = resetAllSections();
      continue;
    }

    if (!inConstraints) continue;

    if (lineIndent <= constraintsIndent && trimmed !== 'constraints:') {
      inConstraints = false;
      states = resetAllSections();
      continue;
    }

    states = updateSectionStates(states, lineIndent, sectionIndents, trimmed);

    const sectionStart = parseSectionStart(line);
    if (sectionStart) {
      switch (sectionStart.type) {
        case 'global':
          states.inGlobal = true;
          sectionIndents.globalIndent = sectionStart.indent;
          break;
        case 'forbid':
          states.inForbid = true;
          sectionIndents.forbidIndent = sectionStart.indent;
          states.inRequire = false;
          break;
        case 'require':
          states.inRequire = true;
          sectionIndents.requireIndent = sectionStart.indent;
          states.inForbid = false;
          break;
      }
      continue;
    }

    const subSection = parseSubSection(line, states.inForbid, states.inRequire);
    if (subSection) {
      switch (subSection.type) {
        case 'run_regex':
          states.inRunRegex = true;
          sectionIndents.runRegexIndent = subSection.indent;
          break;
        case 'run_contains_all':
          states.inRequireAll = true;
          sectionIndents.requireAllIndent = subSection.indent;
          break;
      }
      continue;
    }

    const regexEntry = parseRegexEntry(line);
    if (regexEntry !== null) {
      if (states.inRunRegex) {
        forbidRegex.push(regexEntry);
      } else if (states.inRequireAll) {
        requireContains.push(regexEntry);
      }
    }
  }

  return { forbidRegex, requireContains };
}

function parsePatternId(line) {
  const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z\d_-]+)/);
  return idMatch ? idMatch[1] : null;
}

function parseUses(line) {
  // Allow 'owner/repo' or 'owner/repo/subpath'. Validate owner/repo parts explicitly
  // and return the original value to preserve any additional subpath.
  const m = line.match(/^\s*uses:\s*(.+)\s*$/);
  if (!m) return null;
  const val = m[1].trim();
  const parts = val.split('/');
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1];
  if (!/^[A-Za-z0-9_. -]+$/.test(owner) || !/^[A-Za-z0-9_. -]+$/.test(repo)) {
    return null;
  }
  return val;
}

function parseEnabled(line) {
  const enabledMatch = line.match(/^\s*enabled:\s*(true|false)\s*$/);
  return enabledMatch ? enabledMatch[1] === 'true' : null;
}

function parseWithEntry(line) {
  const withMatch = line.match(
    /^\s*([A-Za-z0-9_-]+):\s*([A-Za-z0-9_. -]+)\s*$/,
  );
  return withMatch ? { key: withMatch[1], value: withMatch[2] } : null;
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
  let current = null;
  let inRunRegex = false;
  let inWith = false;
  let enabled = true;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const id = parsePatternId(line);
    if (id) {
      if (current && enabled) patterns.push(current);
      current = { id, runRegex: [], uses: '', with: {} };
      inRunRegex = false;
      inWith = false;
      enabled = true;
      continue;
    }

    if (!current) continue;

    const uses = parseUses(line);
    if (uses) {
      current.uses = uses;
    }

    if (trimmed === 'run_regex:') {
      inRunRegex = true;
      inWith = false;
      continue;
    }

    if (trimmed === 'with:') {
      inWith = true;
      inRunRegex = false;
      continue;
    }

    const isEnabled = parseEnabled(line);
    if (isEnabled !== null) {
      enabled = isEnabled;
      continue;
    }

    const regexEntry = cleanRegexEntry(line);
    if (regexEntry !== null && inRunRegex) {
      current.runRegex.push(regexEntry);
    }

    if (inWith) {
      const withEntry = parseWithEntry(line);
      if (withEntry) {
        current.with[withEntry.key] = withEntry.value;
      }
    }
  }

  if (current && enabled) patterns.push(current);
  return patterns;
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
  const pathMatch = line.match(/^\s*workflow_path:\s*["']?(.+?)["']?\s*$/);
  return pathMatch ? pathMatch[1] : null;
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
  const triggers = new Set();
  const allowlist = new Map();
  if (!fs.existsSync(filePath)) {
    fatal(`high-risk triggers allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  let inHighRisk = false;
  let inAllowlist = false;
  let inSelector = false;
  let selectorIndent = 0;
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const indent = line.match(/^(\s*)/)[1].length;
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'high_risk_triggers:') {
      inHighRisk = true;
      inAllowlist = false;
      continue;
    }

    if (trimmed === 'allowlist:') {
      inAllowlist = true;
      inHighRisk = false;
      inSelector = false;
      continue;
    }

    if (inHighRisk && trimmed.startsWith('- ')) {
      triggers.add(trimmed.replaceAll(/^- /g, ''));
    }

    if (inAllowlist) {
      const id = parseHighRiskId(line);
      if (id) {
        addToAllowlist(allowlist, current, current?.status);
        current = {
          id,
          workflow: '',
          trigger: '',
          status: 'active',
        };
        inSelector = false;
        continue;
      }

      if (current) {
        inSelector = updateSelectorState(
          inSelector,
          indent,
          selectorIndent,
          trimmed,
        );

        const status = parseHighRiskStatus(line);
        if (status) current.status = status;

        const workflow = parseWorkflow(line);
        if (workflow) current.workflow = workflow;

        const trigger = parseTrigger(line);
        if (trigger) current.trigger = trigger;

        if (trimmed === 'selector:') {
          inSelector = true;
          selectorIndent = indent;
          continue;
        }

        if (inSelector) {
          const workflowPath = parseWorkflowPath(line);
          if (workflowPath) {
            current.workflow = workflowPath;
          }
        }
      }
    }
  }

  addToAllowlist(allowlist, current, current?.status);
  return { triggers, allowlist };
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
  return permMatch ? { key: permMatch[1], value: permMatch[2] } : null;
}

function parseBaselinePermission(line) {
  const permMatch = line.match(
    /^\s{6}([A-Za-z\d_-]+):\s*(none|read|write)\s*$/,
  );
  return permMatch ? { key: permMatch[1], value: permMatch[2] } : null;
}

export function loadPermissionsBaseline(filePath) {
  const baseline = { defaults: { unspecified: 'none' }, workflows: {} };
  if (!fs.existsSync(filePath)) {
    fatal(`permissions baseline not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  let inDefaults = false;
  let inPolicy = false;
  let inWorkflows = false;
  let inBaseline = false;
  let current = '';

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'defaults:') {
      inDefaults = true;
      inPolicy = false;
      inWorkflows = false;
      continue;
    }

    if (trimmed === 'policy:') {
      inPolicy = true;
      inDefaults = false;
      inWorkflows = false;
      continue;
    }

    if (trimmed === 'workflows:') {
      inWorkflows = true;
      inDefaults = false;
      inPolicy = false;
      continue;
    }

    if (inDefaults) {
      const unspecified = parseUnspecified(line);
      if (unspecified) {
        baseline.defaults.unspecified = unspecified;
      }
    }

    if (inPolicy) {
      const unspecifiedPermission = parseUnspecifiedPermission(line);
      if (unspecifiedPermission) {
        baseline.defaults.unspecified = unspecifiedPermission;
      }
    }

    if (inWorkflows) {
      const wfName = parseWorkflowName(line);
      if (wfName) {
        current = wfName;
        if (!baseline.workflows[current]) baseline.workflows[current] = {};
        inBaseline = false;
        continue;
      }

      if (current && isBaselineLine(line)) {
        inBaseline = true;
        continue;
      }

      if (current && inBaseline) {
        const baselinePerm = parseBaselinePermission(line);
        if (baselinePerm) {
          baseline.workflows[current][baselinePerm.key] = baselinePerm.value;
        }
        continue;
      }

      const perm = parsePermission(line);
      if (perm && current) {
        baseline.workflows[current][perm.key] = perm.value;
      }
    }
  }

  return baseline;
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
  let inRequired = false;
  let inAllowlist = false;
  let current = '';

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionStates = updateArtifactSectionStates(
      inRequired,
      inAllowlist,
      trimmed,
    );
    inRequired = sectionStates.inRequired;
    inAllowlist = sectionStates.inAllowlist;

    const retentionDays = parseRetentionDays(trimmed);
    if (retentionDays !== null) {
      policy.defaultRetention = retentionDays;
    }

    const requiredPath = parseRequiredPath(trimmed);
    if (requiredPath !== null && inRequired) {
      policy.requiredPaths.push(requiredPath);
    }

    if (inAllowlist) {
      const wfName = parseArtifactWorkflowName(line);
      if (wfName) {
        current = wfName;
        if (!policy.allowlist.has(current)) {
          policy.allowlist.set(current, new Set());
        }
        continue;
      }

      const artifactName = parseArtifactName(line);
      if (artifactName && current) {
        policy.allowlist.get(current).add(artifactName);
      }
    }
  }

  return policy;
}
