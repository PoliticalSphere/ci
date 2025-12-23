import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

// Reuse console helpers from Validate-CI to avoid duplication across the repo.
export {
  detail,
  getRepoRoot,
  info,
  isCI,
  section,
} from '../scripts/ci/validate-ci/console.js';

export function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
export function mktemp(prefix = 'vcitest-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function readYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return { raw, doc: YAML.parse(raw) };
  } catch (err) {
    fail(`YAML parse failed: ${filePath}\n${err?.message || err}`);
  }
}

export function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function assertContains(text, needle, rel, hint) {
  if (!text.includes(needle)) {
    fail(`${rel}: missing required content: ${needle}\nHINT: ${hint}`);
  }
}
