// ==============================================================================
// Political Sphere — Validate-CI Policy Loaders
// ------------------------------------------------------------------------------
// Purpose:
//   Load policy configuration files with minimal parsing logic.
// ==============================================================================

import fs from 'node:fs';

import { fatal } from './console.js';

function parseSelectorEntries(text, startMarker = 'allowlist', opts = {}) {
  const { entryHasStatus = false } = opts;
  const entries = [];
  let current = null;
  let inSection = false;
  let inSelector = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!inSection) {
      if (trimmed === `${startMarker}:` || /^\s*allowlist\s*:/.test(line)) {
        inSection = true;
      }
      continue;
    }

    const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z0-9_-]+)/);
    if (idMatch) {
      if (current) {
        if (entryHasStatus) {
          const entryStatus = current.status || 'active';
          if (entryStatus === 'active') entries.push(current);
        } else {
          entries.push(current);
        }
      }
      current = { id: idMatch[1], selector: {} };
      if (entryHasStatus) current.status = '';
      inSelector = false;
      continue;
    }

    if (!current) continue;

    if (entryHasStatus) {
      const statusMatch = line.match(/^\s*status:\s*([A-Za-z0-9_-]+)/);
      if (statusMatch) {
        current.status = statusMatch[1];
        continue;
      }
    }

    if (trimmed === 'selector:') {
      inSelector = true;
      continue;
    }

    if (inSelector) {
      const selMatch = line.match(
        /^\s*(workflow_path|job_id|step_id|step_name):\s*(.+)\s*$/,
      );
      if (selMatch) {
        current.selector[selMatch[1]] = selMatch[2];
      }
    }
  }

  if (current) {
    if (entryHasStatus) {
      const entryStatus = current.status || 'active';
      if (entryStatus === 'active') entries.push(current);
    } else {
      entries.push(current);
    }
  }
  return entries;
}

export function permissionLevel(value) {
  if (value === 'none') return 0;
  if (value === 'read') return 1;
  if (value === 'write') return 2;
  return -1;
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
    const repoMatch = line.match(
      /^\s*-\s*repo:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/,
    );
    if (repoMatch) {
      if (inEntry && currentRepo && currentAllowed) {
        allow.add(currentRepo);
      }
      currentRepo = repoMatch[1];
      currentAllowed = true;
      inEntry = true;
      continue;
    }
    if (inEntry) {
      const allowedMatch = line.match(/^\s*allowed:\s*(true|false)\s*$/);
      if (allowedMatch) {
        currentAllowed = allowedMatch[1] === 'true';
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

export function loadInlineConstraints(filePath) {
  if (!fs.existsSync(filePath)) {
    fatal(`inline bash allowlist not found at ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const forbidRegex = [];
  const requireContains = [];
  let inConstraints = false;
  let constraintsIndent = 0;
  let inGlobal = false;
  let globalIndent = 0;
  let inForbid = false;
  let forbidIndent = 0;
  let inRequire = false;
  let requireIndent = 0;
  let inRunRegex = false;
  let runRegexIndent = 0;
  let inRequireAll = false;
  let requireAllIndent = 0;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const indent = line.match(/^(\s*)/)[1].length;
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (indent === 0 && trimmed === 'allowlist:') {
      break;
    }
    if (indent === 0 && trimmed === 'constraints:') {
      inConstraints = true;
      constraintsIndent = indent;
      inGlobal = false;
      inForbid = false;
      inRequire = false;
      inRunRegex = false;
      inRequireAll = false;
      continue;
    }
    if (!inConstraints) continue;
    if (indent <= constraintsIndent && trimmed !== 'constraints:') {
      inConstraints = false;
      inGlobal = false;
      inForbid = false;
      inRequire = false;
      inRunRegex = false;
      inRequireAll = false;
      continue;
    }

    if (inGlobal && indent <= globalIndent && trimmed !== 'global:') {
      inGlobal = false;
    }
    if (inForbid && indent <= forbidIndent && trimmed !== 'forbid:') {
      inForbid = false;
      inRunRegex = false;
    }
    if (inRequire && indent <= requireIndent && trimmed !== 'require:') {
      inRequire = false;
      inRequireAll = false;
    }
    if (inRunRegex && indent <= runRegexIndent && !trimmed.startsWith('- ')) {
      inRunRegex = false;
    }
    if (
      inRequireAll &&
      indent <= requireAllIndent &&
      !trimmed.startsWith('- ')
    ) {
      inRequireAll = false;
    }

    if (trimmed === 'global:') {
      inGlobal = true;
      globalIndent = indent;
      continue;
    }

    if (trimmed === 'forbid:') {
      inForbid = true;
      forbidIndent = indent;
      inRequire = false;
      continue;
    }
    if (trimmed === 'require:') {
      inRequire = true;
      requireIndent = indent;
      inForbid = false;
      continue;
    }
    if (inForbid && trimmed === 'run_regex:') {
      inRunRegex = true;
      runRegexIndent = indent;
      continue;
    }
    if (inRequire && trimmed === 'run_contains_all:') {
      inRequireAll = true;
      requireAllIndent = indent;
      continue;
    }
    if (inRunRegex && trimmed.startsWith('- ')) {
      forbidRegex.push(trimmed.replace(/^- /, '').replace(/^"|"$/g, ''));
      continue;
    }
    if (inRequireAll && trimmed.startsWith('- ')) {
      requireContains.push(trimmed.replace(/^- /, '').replace(/^"|"$/g, ''));
    }
  }

  return { forbidRegex, requireContains };
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

    const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z0-9_-]+)/);
    if (idMatch) {
      if (current && enabled) patterns.push(current);
      current = { id: idMatch[1], runRegex: [], uses: '', with: {} };
      inRunRegex = false;
      inWith = false;
      enabled = true;
      continue;
    }

    if (!current) continue;

    const usesMatch = line.match(
      /^\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/,
    );
    if (usesMatch) {
      current.uses = usesMatch[1];
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
    const enabledMatch = line.match(/^\s*enabled:\s*(true|false)\s*$/);
    if (enabledMatch) {
      enabled = enabledMatch[1] === 'true';
      continue;
    }
    if (inRunRegex && trimmed.startsWith('- ')) {
      current.runRegex.push(trimmed.replace(/^- /, '').replace(/^"|"$/g, ''));
    }
    if (inWith) {
      const withMatch = line.match(
        /^\s*([A-Za-z0-9_-]+):\s*([A-Za-z0-9_.-]+)\s*$/,
      );
      if (withMatch) {
        current.with[withMatch[1]] = withMatch[2];
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
      triggers.add(trimmed.replace(/^- /, ''));
    }
    if (inAllowlist) {
      const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z0-9_-]+)/);
      if (idMatch) {
        if (current?.workflow && current?.trigger) {
          const set = allowlist.get(current.workflow) || new Set();
          if (current.status !== 'retired') {
            set.add(current.trigger);
            allowlist.set(current.workflow, set);
          }
        }
        current = {
          id: idMatch[1],
          workflow: '',
          trigger: '',
          status: 'active',
        };
        inSelector = false;
        continue;
      }
      if (current) {
        if (inSelector && indent <= selectorIndent && trimmed !== 'selector:') {
          inSelector = false;
        }
        const statusMatch = line.match(/^\s*status:\s*([A-Za-z0-9_-]+)/);
        if (statusMatch) current.status = statusMatch[1];
        const wfMatch = line.match(/^\s*workflow:\s*(.+)\s*$/);
        if (wfMatch) current.workflow = wfMatch[1];
        const trigMatch = line.match(/^\s*trigger:\s*([A-Za-z0-9_-]+)\s*$/);
        if (trigMatch) current.trigger = trigMatch[1];
        if (trimmed === 'selector:') {
          inSelector = true;
          selectorIndent = indent;
          continue;
        }
        if (inSelector) {
          const pathMatch = line.match(
            /^\s*workflow_path:\s*["']?(.+?)["']?\s*$/,
          );
          if (pathMatch) {
            current.workflow = pathMatch[1];
          }
        }
      }
    }
  }
  if (current?.workflow && current?.trigger && current.status !== 'retired') {
    const set = allowlist.get(current.workflow) || new Set();
    set.add(current.trigger);
    allowlist.set(current.workflow, set);
  }
  return { triggers, allowlist };
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
      const dMatch = line.match(/^\s*unspecified:\s*(none|read|write)\s*$/);
      if (dMatch) baseline.defaults.unspecified = dMatch[1];
    }
    if (inPolicy) {
      const dMatch = line.match(
        /^\s*unspecified_permission:\s*(none|read|write)\s*$/,
      );
      if (dMatch) baseline.defaults.unspecified = dMatch[1];
    }
    if (inWorkflows) {
      const wfMatch = line.match(/^\s{2}([a-z0-9-]+):\s*$/);
      if (wfMatch) {
        current = wfMatch[1];
        if (!baseline.workflows[current]) baseline.workflows[current] = {};
        inBaseline = false;
        continue;
      }
      if (current && /^\s{4}baseline\s*:/.test(line)) {
        inBaseline = true;
        continue;
      }
      if (current && inBaseline) {
        const permMatch = line.match(
          /^\s{6}([A-Za-z0-9_-]+):\s*(none|read|write)\s*$/,
        );
        if (permMatch) {
          baseline.workflows[current][permMatch[1]] = permMatch[2];
        }
        continue;
      }
      const permMatch = line.match(
        /^\s{4}([A-Za-z0-9_-]+):\s*(none|read|write)\s*$/,
      );
      if (permMatch && current) {
        baseline.workflows[current][permMatch[1]] = permMatch[2];
      }
    }
  }
  return baseline;
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
    if (trimmed === 'required_paths:') {
      inRequired = true;
      inAllowlist = false;
      continue;
    }
    if (trimmed === 'allowlist:') {
      inAllowlist = true;
      inRequired = false;
      continue;
    }
    if (trimmed.startsWith('default_retention_days:')) {
      const match = trimmed.match(/default_retention_days:\s*([0-9]+)/);
      if (match) policy.defaultRetention = Number(match[1]);
    }
    if (inRequired && trimmed.startsWith('- ')) {
      policy.requiredPaths.push(trimmed.replace(/^- /, ''));
    }
    if (inAllowlist) {
      const wfMatch = line.match(/^\s{2}([a-z0-9-]+):\s*$/);
      if (wfMatch) {
        current = wfMatch[1];
        if (!policy.allowlist.has(current))
          policy.allowlist.set(current, new Set());
        continue;
      }
      const nameMatch = line.match(/^\s{4}-\s*name:\s*(.+)\s*$/);
      if (nameMatch && current) {
        policy.allowlist.get(current).add(nameMatch[1]);
      }
    }
  }
  return policy;
}
