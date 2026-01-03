// ==============================================================================
// Political Sphere — Validate-CI Console Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide structured, consistent output for Validate-CI.
// ==============================================================================

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

const LOG_SCHEMA = process.env.PS_LOG_SCHEMA || 'ps.log.v1';

function logEnabled() {
  const mode = String(process.env.PS_LOG_MODE || 'both').toLowerCase();
  return !['human', 'off', 'false', '0'].includes(mode);
}

function logStream() {
  const stream = String(process.env.PS_LOG_STREAM || 'stdout').toLowerCase();
  return stream === 'stderr' ? process.stderr : process.stdout;
}

function logTimestamp() {
  const raw = process.env.SOURCE_DATE_EPOCH || '';
  if (raw && /^\d+$/.test(raw)) {
    const epoch = Number(raw) * 1000;
    return new Date(epoch).toISOString();
  }
  return new Date().toISOString();
}

function escapeLogValue(value) {
  const raw = String(value ?? '')
    .replaceAll(/[\r\n\t]+/g, ' ')
    .trimEnd();
  if (raw === '') return '""';
  if (/[=\s"\\]/.test(raw)) {
    return `"${raw.replaceAll(String.raw`\\`, String.raw`\\\\`).replaceAll('"', String.raw`\"`)}"`;
  }
  return raw;
}

function emitLog({ level = 'info', event = 'log', message = '', ...data }) {
  if (!logEnabled()) return;

  const base = {
    schema: LOG_SCHEMA,
    ts: logTimestamp(),
    level,
    event,
  };

  const component = process.env.PS_LOG_COMPONENT || '';
  if (component) base.component = component;

  const runId = process.env.PS_RUN_ID || process.env.GITHUB_RUN_ID || '';
  if (runId) base.run_id = runId;

  if (message) base.message = message;

  const payload = { ...base, ...data };
  const parts = ['PS.LOG'];
  for (const [key, val] of Object.entries(payload)) {
    if (val === undefined || val === null || val === '') continue;
    parts.push(`${key}=${escapeLogValue(val)}`);
  }
  const line = `${parts.join(' ')}\n`;
  logStream().write(line);

  const logPath = process.env.PS_LOG_PATH || '';
  if (logPath) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, line);
    } catch {
      // Non-fatal: log sinks should not break validation output.
    }
  }
}

export function record(level, event, data = {}) {
  emitLog({ level, event, ...data });
}

function parseEnvFile(raw) {
  const entries = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const entryKey = trimmed.slice(0, eq).trim();
    let entryValue = trimmed.slice(eq + 1).trim();
    if (
      (entryValue.startsWith('"') && entryValue.endsWith('"')) ||
      (entryValue.startsWith("'") && entryValue.endsWith("'"))
    ) {
      entryValue = entryValue.slice(1, -1);
    }
    entries[entryKey] = entryValue;
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
  emitLog({ level: 'info', event: 'section', id, title, detail });
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

export function info(message, opts = {}) {
  if (!opts.skipLog) {
    emitLog({ level: 'info', event: 'info', message });
  }
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
  emitLog({ level: 'info', event: 'detail', message });
  info(`${FORMAT.detailIndent}${message}`, { skipLog: true });
}

export function bullet(message, opts = {}) {
  emitLog({
    level: opts.stream === 'stderr' ? 'warn' : 'info',
    event: 'bullet',
    message,
    stream: opts.stream || 'stdout',
  });
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
  emitLog({ level: 'error', event: 'fatal', message, exit_code: 1 });
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

// Re-export canonical implementations from lib
export { getRepoRoot, isCI } from '../../core/cli.js';
