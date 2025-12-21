// ==============================================================================
// Political Sphere - CLI Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Shared helpers for CLI-style Node scripts (argument parsing + IO).
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

export function resolvePath(root, input) {
  if (!input) return '';
  return path.isAbsolute(input) ? input : path.join(root, input);
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureParentDir(filePath) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeOutputs({
  reportPath,
  summaryPath,
  reportData,
  summaryLines,
}) {
  if (reportPath) {
    ensureParentDir(reportPath);
    fs.writeFileSync(reportPath, `${JSON.stringify(reportData, null, 2)}\n`);
  }

  if (summaryPath) {
    ensureParentDir(summaryPath);
    const lines = Array.isArray(summaryLines) ? summaryLines : [];
    fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
  }
}
