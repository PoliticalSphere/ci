#!/usr/bin/env node

// ==============================================================================
// Political Sphere - Consumer Contract Check
// ------------------------------------------------------------------------------
// Purpose:
//   Validate consumer repositories against a declared CI/tooling contract.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

import {
  bullet,
  detail,
  fatal,
  getRepoRoot,
  section,
} from '../ci/validate-ci/console.js';
import { parseArgs, readText, resolvePath, writeOutputs } from '../lib/cli.js';

async function parseConfig(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
  const raw = readText(filePath);
  if (!raw.trim()) {
    throw new Error(`${label} is empty`);
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(raw);
  }
  if (ext === '.yml' || ext === '.yaml') {
    try {
      const mod = await import('yaml');
      return mod.default.parse(raw);
    } catch (err) {
      throw new Error(
        `${label} uses YAML but the 'yaml' package is not available. ` +
          `Either install it or use JSON config. Root cause: ${err.message}`,
      );
    }
  }
  throw new Error(`${label} must be .json, .yml, or .yaml`);
}

function assertExceptionEntry(entry, label) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(
      `${label} exceptions must be objects with value/reason/risk_decision`,
    );
  }
  if (!entry.value || !entry.reason || !entry.risk_decision) {
    throw new Error(
      `${label} exception missing value/reason/risk_decision: ${JSON.stringify(entry)}`,
    );
  }
}

function loadExceptionSet(entries, label) {
  const set = new Set();
  for (const entry of entries || []) {
    assertExceptionEntry(entry, label);
    set.add(entry.value);
  }
  return set;
}

function listWorkflowFiles(repoRoot) {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];
  const entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(workflowsDir, name));
}

function extractUsesFromWorkflow(raw) {
  const uses = new Set();
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*uses:\s*([^#\s]+)/);
    if (match) uses.add(match[1]);
  }
  return uses;
}

function shouldIgnorePath(relPath, ignoreList) {
  if (!ignoreList || ignoreList.length === 0) return false;
  return ignoreList.some((part) => relPath.includes(part));
}

function resolveImportTarget(baseFile, rawTarget, extensions) {
  const target = rawTarget.replace(/[?#].*$/, '');
  const baseDir = path.dirname(baseFile);
  const resolved = path.resolve(baseDir, target);

  if (path.extname(resolved)) {
    return fs.existsSync(resolved) ? resolved : '';
  }

  for (const ext of extensions) {
    const withExt = `${resolved}${ext}`;
    if (fs.existsSync(withExt)) return withExt;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const ext of extensions) {
      const idx = path.join(resolved, `index${ext}`);
      if (fs.existsSync(idx)) return idx;
    }
  }

  return '';
}

function scanRelativeImports(filePath, extensions) {
  const raw = readText(filePath);
  const imports = [];
  const regexes = [
    /\bimport\s+[^'"]*\s+from\s+['"](\.[^'"]+)['"]/g,
    /\bexport\s+[^'"]*\s+from\s+['"](\.[^'"]+)['"]/g,
    /\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ];

  for (const regex of regexes) {
    while (true) {
      const match = regex.exec(raw);
      if (!match) break;
      imports.push(match[1]);
    }
  }

  return imports
    .filter((target) => target.startsWith('./') || target.startsWith('../'))
    .map((target) => ({
      target,
      resolved: resolveImportTarget(filePath, target, extensions),
    }));
}

async function checkRequiredFiles({
  repoRoot,
  requiredFiles,
  failOnMissing,
  fileMissingAllow,
  violations,
}) {
  section(
    'files.required',
    'Required files',
    `${requiredFiles.length} requirement(s)`,
  );
  for (const required of requiredFiles) {
    const target = resolvePath(repoRoot, required);
    if (
      failOnMissing &&
      !fs.existsSync(target) &&
      !fileMissingAllow.has(required)
    ) {
      violations.push({
        code: 'required-file-missing',
        message: `required file missing: ${required}`,
        path: required,
      });
    }
  }
}

function checkForbiddenFiles({
  repoRoot,
  forbiddenFiles,
  filePresentAllow,
  violations,
}) {
  section(
    'files.forbidden',
    'Forbidden files',
    `${forbiddenFiles.length} rule(s)`,
  );
  for (const forbidden of forbiddenFiles) {
    const target = resolvePath(repoRoot, forbidden);
    if (fs.existsSync(target) && !filePresentAllow.has(forbidden)) {
      violations.push({
        code: 'forbidden-file-present',
        message: `forbidden file present: ${forbidden}`,
        path: forbidden,
      });
    }
  }
}

function readPackageJson(repoRoot) {
  const packageJsonPath = resolvePath(repoRoot, 'package.json');
  let packageJson = {};
  if (fs.existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(readText(packageJsonPath));
    } catch (err) {
      fatal(`package.json is not valid JSON: ${err.message}`);
    }
  }
  return packageJson;
}

function checkRequiredScripts({
  policy,
  packageJson,
  failOnMissing,
  scriptMissingAllow,
  violations,
}) {
  const rawScripts = policy.required_scripts || {};
  const requiredScripts = Array.isArray(rawScripts)
    ? Object.fromEntries(rawScripts.map((name) => [name, [name]]))
    : rawScripts;
  const scriptNames = Object.keys(requiredScripts);
  section(
    'scripts.required',
    'Required scripts',
    `${scriptNames.length} script(s)`,
  );
  for (const name of scriptNames) {
    const options = Array.isArray(requiredScripts[name])
      ? requiredScripts[name]
      : [requiredScripts[name]];
    const found = options.some((opt) => packageJson.scripts?.[opt]);
    if (failOnMissing && !found && !scriptMissingAllow.has(name)) {
      violations.push({
        code: 'script-missing',
        message: `required script missing: ${name}`,
        path: 'package.json',
      });
    }
  }
  return requiredScripts;
}

function gatherDeps(packageJson) {
  // Combine dependency objects using object spread for clarity and modern style
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  };
}

function checkTools({
  policy,
  deps,
  failOnMissing,
  toolMissingAllow,
  toolPresentAllow,
  violations,
}) {
  const tooling = policy.tooling || {};
  const requiredTools = Array.isArray(tooling.require) ? tooling.require : [];
  const forbiddenTools = Array.isArray(tooling.disallow)
    ? tooling.disallow
    : [];

  section(
    'tools.required',
    'Required tools',
    `${requiredTools.length} tool(s)`,
  );
  for (const tool of requiredTools) {
    if (failOnMissing && !deps[tool] && !toolMissingAllow.has(tool)) {
      violations.push({
        code: 'tool-missing',
        message: `required tool missing: ${tool}`,
        path: 'package.json',
      });
    }
  }

  section(
    'tools.forbidden',
    'Forbidden tools',
    `${forbiddenTools.length} rule(s)`,
  );
  for (const tool of forbiddenTools) {
    if (deps[tool] && !toolPresentAllow.has(tool)) {
      violations.push({
        code: 'tool-forbidden',
        message: `forbidden tool present: ${tool}`,
        path: 'package.json',
      });
    }
  }
}

function checkWorkflows({
  policy,
  repoRoot,
  failOnUnknown,
  workflowTopLevelAllow,
  workflowMissingAllow,
  failOnMissing,
  violations,
}) {
  const workflows = policy.workflows || {};
  const workflowFiles = listWorkflowFiles(repoRoot);
  const allowedTopLevel = Array.isArray(workflows.allowed_top_level)
    ? workflows.allowed_top_level
    : [];

  section(
    'workflows.catalog',
    'Workflow catalog',
    `${workflowFiles.length} workflow(s)`,
  );
  for (const wfPath of workflowFiles) {
    const name = path.basename(wfPath);
    if (
      failOnUnknown &&
      allowedTopLevel.length > 0 &&
      !allowedTopLevel.includes(name) &&
      !workflowTopLevelAllow.has(name)
    ) {
      violations.push({
        code: 'workflow-not-allowed',
        message: `top-level workflow not allowlisted: ${name}`,
        path: path.relative(repoRoot, wfPath),
      });
    }
  }

  const rawUses = new Set();
  for (const wfPath of workflowFiles) {
    const raw = readText(wfPath);
    for (const use of extractUsesFromWorkflow(raw)) {
      rawUses.add(use);
    }
  }

  const requiredUses = Array.isArray(workflows.required_reusable)
    ? workflows.required_reusable
    : [];
  section(
    'workflows.required',
    'Required reusable workflows',
    `${requiredUses.length} rule(s)`,
  );
  for (const use of requiredUses) {
    const matched = [...rawUses].some((entry) => entry.includes(use));
    if (failOnMissing && !matched && !workflowMissingAllow.has(use)) {
      violations.push({
        code: 'workflow-use-missing',
        message: `required reusable workflow not used: ${use}`,
        path: '.github/workflows',
      });
    }
  }
}

function checkDocsClaims({
  policy,
  repoRoot,
  deps,
  packageJson,
  failOnMissing,
  toolMissingAllow,
  scriptMissingAllow,
  fileMissingAllow,
  violations,
}) {
  const docsClaims = Array.isArray(policy.docs_claims)
    ? policy.docs_claims
    : [];
  section('docs.claims', 'Doc claims', `${docsClaims.length} rule(s)`);
  function checkClaimTools(
    claim,
    deps,
    failOnMissing,
    toolMissingAllow,
    violations,
  ) {
    const requiredToolsClaim = claim.requires_tools || [];
    for (const tool of requiredToolsClaim) {
      if (failOnMissing && !deps[tool] && !toolMissingAllow.has(tool)) {
        violations.push({
          code: 'doc-claim-tool-missing',
          message: `doc claim '${claim.contains}' requires tool: ${tool}`,
          path: claim.path,
        });
      }
    }
  }

  function checkClaimScripts(
    claim,
    packageJson,
    failOnMissing,
    scriptMissingAllow,
    violations,
  ) {
    const requiredScriptsClaim = claim.requires_scripts || [];
    for (const script of requiredScriptsClaim) {
      if (
        failOnMissing &&
        !packageJson.scripts?.[script] &&
        !scriptMissingAllow.has(script)
      ) {
        violations.push({
          code: 'doc-claim-script-missing',
          message: `doc claim '${claim.contains}' requires script: ${script}`,
          path: claim.path,
        });
      }
    }
  }

  function checkClaimFiles(
    claim,
    repoRoot,
    failOnMissing,
    fileMissingAllow,
    violations,
  ) {
    const requiredFilesClaim = claim.requires_files || [];
    for (const file of requiredFilesClaim) {
      if (
        failOnMissing &&
        !fs.existsSync(resolvePath(repoRoot, file)) &&
        !fileMissingAllow.has(file)
      ) {
        violations.push({
          code: 'doc-claim-file-missing',
          message: `doc claim '${claim.contains}' requires file: ${file}`,
          path: claim.path,
        });
      }
    }
  }

  for (const claim of docsClaims) {
    const docPath = resolvePath(repoRoot, claim.path || '');
    if (!claim.path || !fs.existsSync(docPath)) continue;
    const raw = readText(docPath).toLowerCase();
    const needle = String(claim.contains || '').toLowerCase();
    if (!needle || !raw.includes(needle)) continue;

    checkClaimTools(claim, deps, failOnMissing, toolMissingAllow, violations);
    checkClaimScripts(
      claim,
      packageJson,
      failOnMissing,
      scriptMissingAllow,
      violations,
    );
    checkClaimFiles(
      claim,
      repoRoot,
      failOnMissing,
      fileMissingAllow,
      violations,
    );
  }
}

function checkLockfileAndPackageManager({
  packageManager,
  requiredFiles,
  packageJson,
  repoRoot,
  failOnMissing,
  failOnUnknown,
  violations,
}) {
  if (
    packageManager.lockfile &&
    !requiredFiles.includes(packageManager.lockfile)
  ) {
    const lockTarget = resolvePath(repoRoot, packageManager.lockfile);
    if (failOnMissing && !fs.existsSync(lockTarget)) {
      violations.push({
        code: 'lockfile-missing',
        message: `required lockfile missing: ${packageManager.lockfile}`,
        path: packageManager.lockfile,
      });
    }
  }

  if (packageManager.name && packageJson.packageManager) {
    const declared = String(packageJson.packageManager).toLowerCase();
    const expected = String(packageManager.name).toLowerCase();
    if (failOnUnknown && !declared.startsWith(expected)) {
      violations.push({
        code: 'package-manager-mismatch',
        message: `packageManager mismatch (expected ${packageManager.name})`,
        path: 'package.json',
      });
    }
  }
  if (packageManager.name && !packageJson.packageManager && failOnMissing) {
    violations.push({
      code: 'package-manager-missing',
      message: 'packageManager field missing in package.json',
      path: 'package.json',
    });
  }
}

function checkPathIntegrity({
  policy,
  repoRoot,
  importAllow,
  failOnMissing,
  violations,
}) {
  const pathIntegrity = policy.path_integrity || {};
  if (pathIntegrity.enabled === true) {
    const roots = Array.isArray(pathIntegrity.roots) ? pathIntegrity.roots : [];
    const ignore = Array.isArray(pathIntegrity.ignore)
      ? pathIntegrity.ignore
      : [];
    const exts = Array.isArray(pathIntegrity.extensions)
      ? pathIntegrity.extensions
      : ['.ts', '.tsx', '.js', '.jsx'];

    section('imports.integrity', 'Path integrity', `${roots.length} root(s)`);
    for (const root of roots) {
      const absRoot = resolvePath(repoRoot, root);
      if (!fs.existsSync(absRoot)) continue;

      const stack = [absRoot];
      while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(current, entry.name);
          const rel = path.relative(repoRoot, full);
          if (shouldIgnorePath(rel, ignore)) continue;
          if (entry.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!entry.isFile()) continue;
          if (!exts.includes(path.extname(entry.name))) continue;

          function checkUnresolvedImports(
            imports,
            rel,
            importAllow,
            failOnMissing,
            violations,
          ) {
            for (const item of imports) {
              if (item.resolved) continue;
              const key = `${rel}:${item.target}`;
              if (importAllow.has(key) || importAllow.has(item.target)) {
                continue;
              }
              if (failOnMissing) {
                violations.push({
                  code: 'import-unresolved',
                  message: `unresolved import '${item.target}' in ${rel}`,
                  path: rel,
                });
              }
            }
          }

          const imports = scanRelativeImports(full, exts);
          checkUnresolvedImports(
            imports,
            rel,
            importAllow,
            failOnMissing,
            violations,
          );
        }
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.env.PS_CONTRACT_REPO_ROOT || getRepoRoot();

  const policyPath = resolvePath(
    repoRoot,
    args.policy ||
      process.env.PS_CONTRACT_POLICY ||
      'configs/consumer/contract.json',
  );
  const exceptionsPath = resolvePath(
    repoRoot,
    args.exceptions ||
      process.env.PS_CONTRACT_EXCEPTIONS ||
      'configs/consumer/exceptions.json',
  );
  const reportPath = resolvePath(
    repoRoot,
    args.report ||
      process.env.PS_CONTRACT_REPORT ||
      path.join(repoRoot, 'reports', 'contracts', 'contract.json'),
  );
  const summaryPath = resolvePath(
    repoRoot,
    args.summary ||
      process.env.PS_CONTRACT_SUMMARY ||
      path.join(repoRoot, 'reports', 'contracts', 'contract.txt'),
  );

  const policyDoc = await parseConfig(policyPath, 'contract policy');
  if (!policyDoc || typeof policyDoc !== 'object' || !policyDoc.policy) {
    fatal('contract policy missing required policy object');
  }
  const policy = policyDoc.policy || {};
  const mode = policy.mode === 'advisory' ? 'advisory' : 'enforce';
  const failOnMissing =
    policy.fail_on_missing !== false &&
    String(policy.fail_on_missing || '').toLowerCase() !== 'false';
  const failOnUnknown =
    policy.fail_on_unknown !== false &&
    String(policy.fail_on_unknown || '').toLowerCase() !== 'false';

  section('contract', 'Consumer contract check', `Repo: ${repoRoot}`);
  detail(`Policy: ${path.relative(repoRoot, policyPath)}`);
  detail(`Mode: ${mode}`);

  let exceptionsDoc = { exceptions: {} };
  if (fs.existsSync(exceptionsPath)) {
    exceptionsDoc = await parseConfig(exceptionsPath, 'exceptions policy');
    if (!exceptionsDoc || typeof exceptionsDoc !== 'object') {
      fatal('exceptions policy is not a valid object');
    }
  }

  const exceptions = exceptionsDoc.exceptions || {};
  const fileMissingAllow = loadExceptionSet(
    exceptions.files?.allow_missing,
    'files.allow_missing',
  );
  const filePresentAllow = loadExceptionSet(
    exceptions.files?.allow_present,
    'files.allow_present',
  );
  const scriptMissingAllow = loadExceptionSet(
    exceptions.scripts?.allow_missing,
    'scripts.allow_missing',
  );
  const toolMissingAllow = loadExceptionSet(
    exceptions.tools?.allow_missing,
    'tools.allow_missing',
  );
  const toolPresentAllow = loadExceptionSet(
    exceptions.tools?.allow_present,
    'tools.allow_present',
  );
  const workflowMissingAllow = loadExceptionSet(
    exceptions.workflows?.allow_missing_uses,
    'workflows.allow_missing_uses',
  );
  const workflowTopLevelAllow = loadExceptionSet(
    exceptions.workflows?.allow_top_level,
    'workflows.allow_top_level',
  );
  const importAllow = loadExceptionSet(
    exceptions.imports?.allow_unresolved,
    'imports.allow_unresolved',
  );

  const violations = [];

  const requiredFiles = Array.isArray(policy.required_files)
    ? policy.required_files
    : [];
  const forbiddenFiles = Array.isArray(policy.forbidden_files)
    ? policy.forbidden_files
    : [];
  const packageManager =
    policy.package_manager && typeof policy.package_manager === 'object'
      ? policy.package_manager
      : {};

  await checkRequiredFiles({
    repoRoot,
    requiredFiles,
    failOnMissing,
    fileMissingAllow,
    violations,
  });

  checkForbiddenFiles({
    repoRoot,
    forbiddenFiles,
    filePresentAllow,
    violations,
  });

  const packageJson = readPackageJson(repoRoot);

  const requiredScripts = checkRequiredScripts({
    policy,
    packageJson,
    failOnMissing,
    scriptMissingAllow,
    violations,
  });

  const deps = gatherDeps(packageJson);

  checkTools({
    policy,
    deps,
    failOnMissing,
    toolMissingAllow,
    toolPresentAllow,
    violations,
  });

  checkWorkflows({
    policy,
    repoRoot,
    failOnUnknown,
    workflowTopLevelAllow,
    workflowMissingAllow,
    failOnMissing,
    violations,
  });

  checkDocsClaims({
    policy,
    repoRoot,
    deps,
    packageJson,
    failOnMissing,
    toolMissingAllow,
    scriptMissingAllow,
    fileMissingAllow,
    violations,
  });

  checkLockfileAndPackageManager({
    packageManager,
    requiredFiles,
    packageJson,
    repoRoot,
    failOnMissing,
    failOnUnknown,
    violations,
  });

  checkPathIntegrity({
    policy,
    repoRoot,
    importAllow,
    failOnMissing,
    violations,
  });

  const summary = {
    mode,
    violations: violations.length,
  };

  const summaryLines = [
    'Consumer contract summary',
    `Mode: ${mode}`,
    `Violations: ${violations.length}`,
  ];

  if (violations.length > 0) {
    summaryLines.push('', 'Violations:');
    for (const v of violations) {
      summaryLines.push(`- ${v.path}: ${v.message}`);
    }
  }

  writeOutputs({
    reportPath,
    summaryPath,
    reportData: {
      summary,
      policy: {
        mode,
        required_files: requiredFiles,
        required_scripts: requiredScripts,
      },
      violations,
    },
    summaryLines,
  });

  if (violations.length > 0 && mode === 'enforce') {
    section(
      'result',
      'Consumer contract failed',
      `${violations.length} issue(s)`,
    );
    for (const v of violations) {
      bullet(`${v.path}: ${v.message}`, { stream: 'stderr' });
    }
    process.exit(1);
  }

  if (violations.length > 0) {
    section(
      'result',
      'Consumer contract advisory',
      `${violations.length} issue(s)`,
    );
    for (const v of violations) {
      bullet(`${v.path}: ${v.message}`, { stream: 'stderr' });
    }
    process.exit(0);
  }

  section('result', 'Consumer contract passed', 'Policy checks satisfied');
}

// prefer top-level await
try {
  await main();
} catch (err) {
  fatal(err.message || String(err));
}
