#!/usr/bin/env node

// ==============================================================================
// Political Sphere - License Compliance Check
// ------------------------------------------------------------------------------
// Purpose:
//   Validate dependency licenses against a policy allowlist/denylist.
// ==============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { bullet, detail, fatal, section } from '../ci/validate-ci/console.js';
import { parseArgs, readText, resolvePath, writeOutputs } from '../lib/cli.js';

const nameFromPathCache = new Map();

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
  const cached = nameFromPathCache.get(entryPath);
  if (cached) {
    return cached;
  }
  const parts = entryPath.split('node_modules/').filter(Boolean);
  if (parts.length === 0) {
    nameFromPathCache.set(entryPath, entryPath);
    return entryPath;
  }
  let tail = parts[parts.length - 1];
  while (tail.endsWith('/')) {
    tail = tail.slice(0, -1);
  }
  const segments = tail.split('/').filter(Boolean);
  if (segments.length === 0) {
    nameFromPathCache.set(entryPath, entryPath);
    return entryPath;
  }
  if (segments[0].startsWith('@') && segments.length >= 2) {
    const scoped = `${segments[0]}/${segments[1]}`;
    nameFromPathCache.set(entryPath, scoped);
    return scoped;
  }
  const name = segments[0];
  nameFromPathCache.set(entryPath, name);
  return name;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
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
    policyHash: sha256(raw),
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

  const allowRegex = Array.isArray(exception.allowlist_regex)
    ? compileRegex(exception.allowlist_regex, 'allowlist')
    : basePolicy.allowRegex;

  const denyRegex = Array.isArray(exception.denylist_regex)
    ? compileRegex(exception.denylist_regex, 'denylist')
    : basePolicy.denyRegex;

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

function isValidSpdxId(token) {
  if (!token) return false;
  if (token === 'NONE' || token === 'NOASSERTION') return true;
  if (/^LicenseRef-[A-Za-z0-9.-]+$/.test(token)) return true;
  if (/^DocumentRef-[A-Za-z0-9.-]+:LicenseRef-[A-Za-z0-9.-]+$/.test(token)) {
    return true;
  }
  return /^[A-Za-z0-9][A-Za-z0-9.-]*(\+)?$/.test(token);
}

function isValidSpdxExpressionToken(token) {
  if (!token) return false;
  const upper = token.toUpperCase();
  const withIndex = upper.indexOf(' WITH ');
  if (withIndex !== -1) {
    const left = token.slice(0, withIndex).trim();
    const right = token.slice(withIndex + ' WITH '.length).trim();
    return isValidSpdxId(left) && isValidSpdxId(right);
  }
  return isValidSpdxId(token);
}

function evaluateSimpleLicense(policy, license) {
  // Normalize token and remove outer parentheses and whitespace in a clear way
  let tokens = String(license).trim();
  // Remove all leading '(' and all trailing ')' explicitly (avoid ambiguous alternation)
  while (tokens.startsWith('(')) tokens = tokens.slice(1);
  while (tokens.endsWith(')')) tokens = tokens.slice(0, -1);
  tokens = tokens.trim();
  if (!tokens) return { ok: false, reason: 'missing-license', match: null };

  if (/^SEE LICENSE IN/i.test(tokens)) {
    return policy.allowFileReference
      ? { ok: true, reason: 'file-reference-allowed', match: null }
      : { ok: false, reason: 'file-reference-disallowed', match: null };
  }

  if (!isValidSpdxExpressionToken(tokens)) {
    return { ok: false, reason: 'invalid-license', match: null };
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

function isOperatorToken(token) {
  return token === 'AND' || token === 'OR';
}

function tokenizeSpdxExpression(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i += 1;
      continue;
    }
    const start = i;
    while (i < expr.length && !/\s|\(|\)/.test(expr[i])) {
      i += 1;
    }
    tokens.push(expr.slice(start, i));
  }

  const merged = [];
  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    if (/^WITH$/i.test(token) && merged.length > 0 && idx + 1 < tokens.length) {
      const prev = merged.pop();
      const next = tokens[idx + 1];
      if (
        prev !== '(' &&
        prev !== ')' &&
        !isOperatorToken(String(prev).toUpperCase()) &&
        next !== '(' &&
        next !== ')' &&
        !isOperatorToken(String(next).toUpperCase())
      ) {
        merged.push(`${prev} WITH ${next}`);
        idx += 1;
        continue;
      }
      merged.push(prev);
    }
    merged.push(token);
  }

  return merged;
}

function toRpn(tokens) {
  const output = [];
  const ops = [];
  const prec = { OR: 1, AND: 2 };

  for (const token of tokens) {
    if (token === '(') {
      ops.push(token);
      continue;
    }
    if (token === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        output.push(ops.pop());
      }
      if (ops.length === 0) return null;
      ops.pop();
      continue;
    }

    const upper = String(token).toUpperCase();
    if (isOperatorToken(upper)) {
      while (
        ops.length > 0 &&
        isOperatorToken(ops[ops.length - 1]) &&
        prec[ops[ops.length - 1]] >= prec[upper]
      ) {
        output.push(ops.pop());
      }
      ops.push(upper);
      continue;
    }

    output.push(token);
  }

  while (ops.length > 0) {
    const op = ops.pop();
    if (op === '(' || op === ')') return null;
    output.push(op);
  }

  return output;
}

function mergeFailure(left, right) {
  if (left.reason === 'denied-license') return left;
  if (right.reason === 'denied-license') return right;
  return { ok: false, reason: 'not-allowlisted', match: null };
}

function evaluateSpdxExpression(policy, expr) {
  const tokens = tokenizeSpdxExpression(expr);
  if (tokens.length === 0) {
    return { ok: false, reason: 'missing-license', match: null };
  }
  for (const token of tokens) {
    if (
      token !== '(' &&
      token !== ')' &&
      !isOperatorToken(String(token).toUpperCase()) &&
      !isValidSpdxExpressionToken(String(token))
    ) {
      return { ok: false, reason: 'invalid-expression', match: null };
    }
  }
  const rpn = toRpn(tokens);
  if (!rpn) {
    return { ok: false, reason: 'invalid-expression', match: null };
  }

  const stack = [];
  for (const token of rpn) {
    if (isOperatorToken(token)) {
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) {
        return { ok: false, reason: 'invalid-expression', match: null };
      }
      if (token === 'AND') {
        if (left.ok && right.ok) {
          stack.push({
            ok: true,
            reason: 'allowlisted-expression',
            match: left.match || right.match,
          });
        } else {
          stack.push(mergeFailure(left, right));
        }
      } else if (token === 'OR') {
        if (left.ok || right.ok) {
          const match = left.ok ? left.match : right.match;
          stack.push({
            ok: true,
            reason: 'allowlisted-expression',
            match,
          });
        } else {
          stack.push(mergeFailure(left, right));
        }
      }
      continue;
    }
    stack.push(evaluateSimpleLicense(policy, token));
  }

  if (stack.length !== 1) {
    return { ok: false, reason: 'invalid-expression', match: null };
  }

  return stack[0];
}

function evaluateLicense(policy, license) {
  if (!license) {
    return { ok: false, reason: 'missing-license', match: null };
  }

  const raw = String(license).trim();
  if (/\bOR\b/i.test(raw) || /\bAND\b/i.test(raw) || raw.includes('(')) {
    return evaluateSpdxExpression(policy, raw);
  }

  return evaluateSimpleLicense(policy, raw);
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

const seen = new Set();
const packages = collectPackages(lockData)
  .map((pkg) => ({
    ...pkg,
    license: normalizeLicense(pkg.license),
  }))
  .filter((pkg) => pkg.name && !policy.ignore.has(pkg.name))
  .filter((pkg) => {
    const key = `${pkg.name}@${pkg.version || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

packages.sort(
  (a, b) =>
    (a.name || '').localeCompare(b.name || '') ||
    (a.version || '').localeCompare(b.version || '') ||
    (a.license || '').localeCompare(b.license || ''),
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

violations.sort(
  (a, b) =>
    a.name.localeCompare(b.name) ||
    (a.version || '').localeCompare(b.version || ''),
);

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
      policy_path: path.relative(repoRoot, policyPath),
      policy_sha256: policy.policyHash,
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
