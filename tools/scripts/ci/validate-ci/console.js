// ==============================================================================
// Political Sphere — Validate-CI Console Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide structured, consistent output for Validate-CI.
// ==============================================================================

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FORMAT = {
  icon: '▶',
  separator: '—',
  detailIndent: '  ',
  bullet: '-',
  bulletIndent: '  ',
  sectionIdCase: 'upper',
};

function parseEnvFile(raw) {
  const entries = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function loadFormatConfig() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const defaultPath = path.join(
    __dirname,
    '..',
    '..',
    'branding',
    'format.env',
  );
  const formatPath = process.env.PS_FORMAT_ENV || defaultPath;

  const format = { ...DEFAULT_FORMAT };
  if (!fs.existsSync(formatPath)) {
    return format;
  }

  const raw = fs.readFileSync(formatPath, 'utf8');
  const entries = parseEnvFile(raw);

  if (entries.PS_FMT_ICON) format.icon = entries.PS_FMT_ICON;
  if (entries.PS_FMT_SEPARATOR) format.separator = entries.PS_FMT_SEPARATOR;
  if (entries.PS_FMT_DETAIL_INDENT)
    format.detailIndent = entries.PS_FMT_DETAIL_INDENT;
  if (entries.PS_FMT_BULLET) format.bullet = entries.PS_FMT_BULLET;
  if (entries.PS_FMT_BULLET_INDENT)
    format.bulletIndent = entries.PS_FMT_BULLET_INDENT;
  if (entries.PS_FMT_SECTION_ID_CASE)
    format.sectionIdCase = entries.PS_FMT_SECTION_ID_CASE;

  return format;
}

const FORMAT = loadFormatConfig();

function formatSectionId(id) {
  if (FORMAT.sectionIdCase === 'lower') return id.toLowerCase();
  if (FORMAT.sectionIdCase === 'original') return id;
  return id.toUpperCase();
}

export function section(id, title, detail = '') {
  const sid = formatSectionId(String(id));
  // CLI output: section headers are printed to stdout intentionally
  const useColor =
    process.env.NO_COLOR !== '1' &&
    (process.env.FORCE_COLOR === '1' || process.stdout.isTTY);
  if (useColor) {
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const dim = '\x1b[2m';
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    console.log(
      `\n${green}${FORMAT.icon}${reset} ${bold}${cyan}${sid}${reset} ${FORMAT.separator} ${bold}${title}${reset}`,
    );
    if (detail) {
      // CLI output: detail printed to stdout intentionally
      console.log(`${FORMAT.detailIndent}${dim}${detail}${reset}`);
    }
    return;
  }

  console.log(`\n${FORMAT.icon} ${sid} ${FORMAT.separator} ${title}`);
  if (detail) {
    // CLI output: detail printed to stdout intentionally
    console.log(`${FORMAT.detailIndent}${detail}`);
  }
}

export function info(message) {
  const useColor =
    process.env.NO_COLOR !== '1' &&
    (process.env.FORCE_COLOR === '1' || process.stdout.isTTY);
  if (useColor) {
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    console.log(`${dim}${message}${reset}`);
    return;
  }
  console.log(message);
}

export function detail(message) {
  info(`${FORMAT.detailIndent}${message}`);
}

export function bullet(message, opts = {}) {
  const indent =
    typeof opts.indent === 'string' ? opts.indent : FORMAT.bulletIndent;
  const prefix = typeof opts.bullet === 'string' ? opts.bullet : FORMAT.bullet;
  const line = `${indent}${prefix} ${message}`;
  if (opts.stream === 'stderr') {
    console.error(line);
    return;
  }
  console.log(line);
}

export function fatal(message) {
  const useColor =
    process.env.NO_COLOR !== '1' &&
    (process.env.FORCE_COLOR === '1' || process.stdout.isTTY);
  if (useColor) {
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const red = '\x1b[31m';
    console.error(`${bold}${red}ERROR:${reset} ${message}`);
  } else {
    console.error(`ERROR: ${message}`);
  }
  process.exit(1);
}

export function getRepoRoot() {
  try {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (r && r.status === 0) return String(r.stdout || '').trim();
    return process.cwd();
  } catch {
    return process.cwd();
  }
}

export function isCI() {
  return String(process.env.CI || '0') === '1';
}
