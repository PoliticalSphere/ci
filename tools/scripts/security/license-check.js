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

import { detail, fatal } from '../ci/validate-ci/console.js';
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

function matches(list, regexes, value) {
  const normalized = value.toLowerCase();
  if (list.some((item) => String(item).toLowerCase() === normalized)) {
    return true;
  }
  return regexes.some((rx) => rx.test(value));
}

function evaluateLicense(policy, license) {
  if (!license) {
    return { ok: false, reason: 'missing-license' };
  }
  if (/^SEE LICENSE IN/i.test(license)) {
    return policy.allowFileReference
      ? { ok: true, reason: 'file-reference-allowed' }
      : { ok: false, reason: 'file-reference-disallowed' };
  }
  if (matches(policy.denylist, policy.denyRegex, license)) {
    return { ok: false, reason: 'denied-license' };
  }
  if (policy.mode === 'denylist') {
    return { ok: true, reason: 'allow-by-default' };
  }
  if (matches(policy.allowlist, policy.allowRegex, license)) {
    return { ok: true, reason: 'allowlisted-license' };
  }
  return { ok: false, reason: 'not-allowlisted' };
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
    });
    unknown.push(pkg);
    continue;
  }

  if (!pkg.license && !pkgPolicy.failOnUnlicensed) {
    unknown.push(pkg);
    continue;
  }

  if (!evaluation.ok) {
    if (evaluation.reason === 'not-allowlisted' && pkgPolicy.failOnUnknown) {
      violations.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        reason: evaluation.reason,
      });
    } else if (evaluation.reason === 'not-allowlisted') {
      unknown.push(pkg);
    } else {
      violations.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        reason: evaluation.reason,
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
    summaryLines.push(
      `- ${v.name}@${v.version || 'unknown'}: ${v.license} (${v.reason})`,
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
  fatal(`${violations.length} license violation(s) found.`);
}

detail('License check: OK');
