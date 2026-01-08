/**
 * PoliticalSphere CI — Policy Evaluator (TypeScript)
 *
 * Produces:
 * - policy.decision.json
 * - policy.summary.md
 *
 * Exits non-zero when policy decision is DENY.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  evaluatePolicy,
  generateMarkdownSummary,
  serializeToJSON,
} from '../src/policy/decision.ts';

type GitHubEvent = {
  pull_request?: {
    body?: string | null;
    base?: { sha?: string | null } | null;
    head?: { sha?: string | null } | null;
  } | null;
};

function readGitHubEvent(): GitHubEvent | null {
  // biome-ignore lint/complexity/useLiteralKeys: GitHub sets env vars via index signature
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (eventPath == null || eventPath === '') {
    return null;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from GitHub Actions
    const raw = readFileSync(eventPath, 'utf8');
    return JSON.parse(raw) as GitHubEvent;
  } catch {
    return null;
  }
}

function getChangedFilesFromGit(baseSha: string, headSha: string): readonly string[] {
  try {
    // Use execFileSync with args array (no shell) for safety.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const out = execFileSync('git', ['diff', '--name-only', baseSha, headSha], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

function safeWriteUtf8(filePath: string, contents: string): void {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- constant output filenames
    writeFileSync(filePath, contents, 'utf8');
  } catch (e) {
    console.error(`Failed to write ${filePath}:`, e);
  }
}

export function main(): number {
  const event = readGitHubEvent();
  const prBody = event?.pull_request?.body ?? '';
  const baseSha = event?.pull_request?.base?.sha ?? null;
  const headSha = event?.pull_request?.head?.sha ?? null;

  if (baseSha == null || baseSha === '' || headSha == null || headSha === '') {
    console.error('Policy evaluator: missing PR base/head SHA; cannot compute changed files.');
    // Fail closed: policy is a governance gate.
    return 1;
  }

  const changedFiles = getChangedFilesFromGit(baseSha, headSha);

  const out = evaluatePolicy({ prBody, changedFiles });

  const decisionJsonPath = path.resolve(process.cwd(), 'policy.decision.json');
  const summaryMdPath = path.resolve(process.cwd(), 'policy.summary.md');

  safeWriteUtf8(decisionJsonPath, serializeToJSON(out.result));
  const summary = generateMarkdownSummary(
    out.result,
    out.classification.reasons,
    out.classification.paths,
  );

  safeWriteUtf8(summaryMdPath, summary);

  if (out.result.decision === 'deny') {
    console.error('Policy decision: DENY');
    console.error('Policy summary (markdown):');
    console.error(summary);
    return 1;
  }

  if (out.result.decision === 'warn') {
    console.log('Policy decision: WARN');
    return 0;
  }

  console.log('Policy decision: ALLOW');
  return 0;
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
/* c8 ignore stop */
