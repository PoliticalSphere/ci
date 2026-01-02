#!/usr/bin/env node

// Script safety checks
// - Find scripts referenced by composite actions (inputs.script defaults or values)
// - Scan those scripts for unsafe patterns: eval, bash -c, backticks, and echo with ${...}

import fs from 'node:fs';
import path from 'node:path';
import { fail, getRepoRoot, section } from './test-utils.js';

const repoRoot = getRepoRoot();
const actionsRoot = path.join(repoRoot, '.github', 'actions');

section('safety', 'Script safety checks', `Root: ${actionsRoot}`);

if (!fs.existsSync(actionsRoot) || !fs.statSync(actionsRoot).isDirectory())
  process.exit(0);

const entries = fs.readdirSync(actionsRoot, { withFileTypes: true });
const actionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

const violations = [];
const sensitiveVarPattern =
  /\$(\{)?(GITHUB_TOKEN|GH_TOKEN|SONAR_TOKEN|NODE_AUTH_TOKEN|TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|ACCESS_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|CLIENT_SECRET)\b/i;

for (const dir of actionDirs) {
  const actionFile = path.join(actionsRoot, dir, 'action.yml');
  if (!fs.existsSync(actionFile)) continue;
  const yaml = fs.readFileSync(actionFile, 'utf8');

  // simple look for default script path patterns
  const scriptMatches = [...yaml.matchAll(/script:\s*"([^"]+)"/g)];
  for (const m of scriptMatches) {
    const scriptPath = path.join(repoRoot, m[1]);
    if (!fs.existsSync(scriptPath)) continue;
    const script = fs.readFileSync(scriptPath, 'utf8');

    const lines = script.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/\beval\b/.test(l) || /bash\s+-c/.test(l) || /`/.test(l)) {
        violations.push({
          file: scriptPath,
          line: i + 1,
          text: l.trim(),
          reason: 'eval/bash -c/backtick',
        });
      }
      if (/echo\s+["'].*\$\{[^}]+\}.*["']/.test(l)) {
        violations.push({
          file: scriptPath,
          line: i + 1,
          text: l.trim(),
          reason: 'echo with variable interpolation (prefer printf %q)',
        });
      }
      if (/\b(echo|printf)\b/.test(l) && sensitiveVarPattern.test(l)) {
        violations.push({
          file: scriptPath,
          line: i + 1,
          text: l.trim(),
          reason: 'echo/printf with sensitive variable interpolation',
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nScript safety violations detected:');
  for (const v of violations) {
    console.error(
      `${path.relative(repoRoot, v.file)}:${v.line}: (${v.reason}) ${v.text}`,
    );
  }
  fail('Found potentially unsafe patterns in referenced scripts.');
}

process.exit(0);
