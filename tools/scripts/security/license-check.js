#!/usr/bin/env node

// ==============================================================================
// Political Sphere - License Compliance Check
// ------------------------------------------------------------------------------
// Purpose:
//   Validate dependency licenses against a policy allowlist/denylist.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { bullet, detail, fatal, section } from '../ci/validate-ci/console.js';
import { parseArgs, readText, resolvePath, writeOutputs } from '../lib/cli.js';

function normalizeLicense(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) {
    return raw.map(normalizeLicense).filter(Boolean).join(' OR ');
  }
  if (typeof raw === 'object') {
    if (typeof raw.type === 'string') return raw.type.trim();
    if (typeof raw.name === 'string') return raw.name.trim();
  }
  return String(raw).trim();
}

function nameFromPath(entryPath) {
  const parts = entryPath.split('node_modules/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : entryPath;
}

function compileRegex(list, label) {
  const compiled = [];
  for (const pattern of list) {
    try {
      compiled.push(new RegExp(pattern, 'i'));
    } catch (err) {
      throw new Error(`${label} regex '${pattern}' is invalid: ${err.message}`);
    }
  }
  return compiled;
}

function loadPolicy(policyPath) {
  if (!fs.existsSync(policyPath)) {
    throw new Error(`license policy not found at ${policyPath}`);
  }
  const raw = readText(policyPath);
  if (!raw.trim()) {
    throw new Error('license policy file is empty');
  }
  const data = yaml.parse(raw);
  if (!data || typeof data !== 'object') {
    throw new Error('license policy is not a valid YAML object');
  }
  const policy = data.policy || {};
  const allowlist = Array.isArray(policy.allowlist) ? policy.allowlist : [];
  const denylist = Array.isArray(policy.denylist) ? policy.denylist : [];
  const allowRegex = compileRegex(
    Array.isArray(policy.allowlist_regex) ? policy.allowlist_regex : [],
    'allowlist',
  );
  const denyRegex = compileRegex(
    Array.isArray(policy.denylist_regex) ? policy.denylist_regex : [],
    'denylist',
  );
  const ignore = Array.isArray(policy.ignore_packages)
    ? new Set(policy.ignore_packages)
    : new Set();
  const exceptions = Array.isArray(policy.exceptions?.packages)
    ? policy.exceptions.packages
    : [];

  return {
    allowlist,
    denylist,
    allowRegex,
    denyRegex,
    ignore,
    exceptions,
    mode: policy.mode || 'allowlist',
    failOnUnknown: policy.fail_on_unknown !== false,
    failOnUnlicensed: policy.fail_on_unlicensed !== false,
    allowFileReference: policy.allow_file_reference === true,
  };
}

function resolvePackagePolicy(basePolicy, name) {
  const exception = basePolicy.exceptions.find((entry) => entry?.name === name);
  if (!exception) return basePolicy;

  const allowlist = Array.isArray(exception.allowlist)
    ? exception.allowlist
    : basePolicy.allowlist;
  const denylist = Array.isArray(exception.denylist)
    ? exception.denylist
    : basePolicy.denylist;
  const allowRegex = compileRegex(
    Array.isArray(exception.allowlist_regex)
      ? exception.allowlist_regex
      : basePolicy.allowRegex.map((rx) => rx.source),
    'allowlist',
  );
  const denyRegex = compileRegex(
    Array.isArray(exception.denylist_regex)
      ? exception.denylist_regex
      : basePolicy.denyRegex.map((rx) => rx.source),
    'denylist',
  );

  return {
    ...basePolicy,
    allowlist,
    denylist,
    allowRegex,
    denyRegex,
  };
}

function matchDetails(list, regexes, value) {
  const normalized = value.toLowerCase();
  for (const item of list) {
    if (String(item).toLowerCase() === normalized) {
      return { matched: true, type: 'exact', pattern: String(item) };
    }
  }
  for (const rx of regexes) {
    if (rx.test(value)) {
      return { matched: true, type: 'regex', pattern: rx.source };
    }
  }
  return { matched: false, type: '', pattern: '' };
}

function evaluateSimpleLicense(policy, license) {
  // Normalize token and remove outer parentheses and whitespace in a clear way
  let tokens = String(license).trim();
  // Remove all leading '(' and all trailing ')' explicitly (avoid ambiguous alternation)
  tokens = tokens.replace(/^\(+/, '').replace(/\)+$/, '').trim();
  if (!tokens) return { ok: false, reason: 'missing-license', match: null };

  if (/^SEE LICENSE IN/i.test(tokens)) {
    return policy.allowFileReference
      ? { ok: true, reason: 'file-reference-allowed', match: null }
      : { ok: false, reason: 'file-reference-disallowed', match: null };
  }

  const denyMatch = matchDetails(policy.denylist, policy.denyRegex, tokens);
  if (denyMatch.matched) {
    return { ok: false, reason: 'denied-license', match: denyMatch };
  }

  if (policy.mode === 'denylist') {
    return { ok: true, reason: 'allow-by-default', match: null };
  }

  const allowMatch = matchDetails(policy.allowlist, policy.allowRegex, tokens);
  if (allowMatch.matched) {
    return { ok: true, reason: 'allowlisted-license', match: allowMatch };
  }

  return { ok: false, reason: 'not-allowlisted', match: null };
}

function evaluateOrExpression(policy, expr) {
  const parts = expr.split(/\s+OR\s+/i).map((p) => p.trim());
  for (const part of parts) {
    const res = evaluateSimpleLicense(policy, part);
    if (res.ok) {
      return { ok: true, reason: 'allowlisted-expression', match: res.match };
    }
  }
  return { ok: false, reason: 'not-allowlisted', match: null };
}

function evaluateAndExpression(policy, expr) {
  const parts = expr.split(/\s+AND\s+/i).map((p) => p.trim());
  for (const part of parts) {
    const res = evaluateSimpleLicense(policy, part);
    if (!res.ok) return { ok: false, reason: 'not-allowlisted', match: null };
  }
  return { ok: true, reason: 'allowlisted-expression', match: null };
}

function evaluateLicense(policy, license) {
  if (!license) {
    return { ok: false, reason: 'missing-license', match: null };
  }

  // Normalize parentheses and common separators then evaluate expressions
  // Support simple SPDX expressions using OR / AND (case-insensitive)
  const raw = String(license).trim();
  // If it contains OR/AND, handle as an expression
  if (/\bOR\b/i.test(raw) || /\bAND\b/i.test(raw)) {
    // Remove outer parentheses if present (explicitly remove leading/trailing parens)
    const expr = raw.replace(/^\(+/, '').replace(/\)+$/, '').trim();

    if (/\bOR\b/i.test(expr)) return evaluateOrExpression(policy, expr);
    if (/\bAND\b/i.test(expr)) return evaluateAndExpression(policy, expr);
  }

  // Fallback: single token evaluation
  return evaluateSimpleLicense(policy, license);
}

function collectPackages(lockData) {
  const packages = [];
  if (lockData && typeof lockData === 'object') {
    if (lockData.packages && typeof lockData.packages === 'object') {
      for (const [entryPath, meta] of Object.entries(lockData.packages)) {
        if (entryPath === '') continue;
        const name = meta?.name || nameFromPath(entryPath);
        packages.push({
          name,
          version: meta?.version || '',
          license: normalizeLicense(meta?.license || meta?.licenses),
        });
      }
      return packages;
    }
    if (lockData.dependencies && typeof lockData.dependencies === 'object') {
      const stack = Object.entries(lockData.dependencies).map(
        ([name, meta]) => ({ name, meta }),
      );
      while (stack.length > 0) {
        const { name, meta } = stack.pop();
        packages.push({
          name,
          version: meta?.version || '',
          license: normalizeLicense(meta?.license || meta?.licenses),
        });
        const deps = meta?.dependencies || {};
        for (const [depName, depMeta] of Object.entries(deps)) {
          stack.push({ name: depName, meta: depMeta });
        }
      }
    }
  }
  return packages;
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const policyPath = resolvePath(
  repoRoot,
  args.policy ||
    process.env.PS_LICENSE_POLICY ||
    'configs/security/license-policy.yml',
);
const lockPath = resolvePath(
  repoRoot,
  args.lock || process.env.PS_LICENSE_LOCK_PATH || 'package-lock.json',
);
const reportPath = resolvePath(
  repoRoot,
  args.report ||
    process.env.PS_LICENSE_REPORT ||
    path.join(
      process.env.PS_REPORT_DIR || path.join(repoRoot, 'reports', 'security'),
      'license-report.json',
    ),
);
const summaryPath = resolvePath(
  repoRoot,
  args.summary ||
    process.env.PS_LICENSE_SUMMARY ||
    path.join(
      process.env.PS_REPORT_DIR || path.join(repoRoot, 'reports', 'security'),
      'license-summary.txt',
    ),
);

let policy;
try {
  policy = loadPolicy(policyPath);
} catch (err) {
  fatal(err.message);
}

if (!fs.existsSync(lockPath)) {
  fatal(`lockfile not found at ${lockPath}`);
}

let lockData;
try {
  lockData = JSON.parse(readText(lockPath));
} catch (err) {
  fatal(`lockfile is not valid JSON: ${err.message}`);
}

const packages = collectPackages(lockData).filter(
  (pkg) => pkg.name && !policy.ignore.has(pkg.name),
);

detail(`License check: scanning ${packages.length} package(s).`);

const violations = [];
const allowed = [];
const unknown = [];

for (const pkg of packages) {
  const pkgPolicy = resolvePackagePolicy(policy, pkg.name);
  const evaluation = evaluateLicense(pkgPolicy, pkg.license);

  if (!pkg.license && pkgPolicy.failOnUnlicensed) {
    violations.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license || 'UNKNOWN',
      reason: 'missing-license',
      match: null,
    });
    unknown.push(pkg);
    continue;
  }

  if (!pkg.license && !pkgPolicy.failOnUnlicensed) {
    unknown.push(pkg);
    continue;
  }

  if (!evaluation.ok) {
    if (evaluation.reason === 'not-allowlisted') {
      if (pkgPolicy.failOnUnknown) {
        violations.push({
          name: pkg.name,
          version: pkg.version,
          license: pkg.license,
          reason: evaluation.reason,
          match: evaluation.match,
        });
      } else {
        unknown.push(pkg);
      }
    } else {
      violations.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        reason: evaluation.reason,
        match: evaluation.match,
      });
    }
  } else {
    allowed.push(pkg);
  }
}

const summaryLines = [
  'License check summary',
  `Total packages: ${packages.length}`,
  `Allowed: ${allowed.length}`,
  `Unknown: ${unknown.length}`,
  `Violations: ${violations.length}`,
];

if (violations.length > 0) {
  summaryLines.push('', 'Violations:');
  for (const v of violations) {
    const matchInfo = v.match?.matched
      ? ` [match: ${v.match.type} ${v.match.pattern}]`
      : '';
    summaryLines.push(
      `- ${v.name}@${v.version || 'unknown'}: ${v.license} (${v.reason})${matchInfo}`,
    );
  }
}

writeOutputs({
  reportPath,
  summaryPath,
  reportData: {
    policy: {
      mode: policy.mode,
      allowFileReference: policy.allowFileReference,
      failOnUnknown: policy.failOnUnknown,
      failOnUnlicensed: policy.failOnUnlicensed,
    },
    summary: {
      total: packages.length,
      allowed: allowed.length,
      unknown: unknown.length,
      violations: violations.length,
    },
    violations,
  },
  summaryLines,
});

if (violations.length > 0) {
  section(
    'security.license',
    'License violations',
    `Total violations: ${violations.length}`,
  );
  for (const v of violations) {
    const matchInfo = v.match?.matched
      ? ` [match: ${v.match.type} ${v.match.pattern}]`
      : '';
    bullet(
      `${v.name}@${v.version || 'unknown'}: ${v.license} (${v.reason})${matchInfo}`,
    );
  }
  fatal(`${violations.length} license violation(s) found.`);
}

detail('License check: OK');
