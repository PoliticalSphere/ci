/**
 * PoliticalSphere CI — Policy Evaluator (TypeScript)
 *
 * Produces:
 * - policy.decision.json
 * - policy.summary.md
 * - PR comment with decision and reasons
 *
 * Exits non-zero when policy decision is DENY.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
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
    number?: number | null;
  } | null;
  repository?: {
    owner?: { login?: string | null } | null;
    name?: string | null;
  } | null;
};

type CombinedStatus = {
  statuses: Array<{ context: string; state: string }>;
};

type CheckRunsResponse = {
  check_runs: Array<{ name: string; conclusion: string | null }>;
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

function fetchGitHubAPI(path: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'PoliticalSphere-CI',
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    };

    https
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data) as unknown);
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
          }
        });
      })
      .on('error', reject);
  });
}

function postGitHubComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body });
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      method: 'POST',
      headers: {
        'User-Agent': 'PoliticalSphere-CI',
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve();
        } else {
          reject(new Error(`Failed to post comment: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function getFailedCIChecks(
  owner: string,
  repo: string,
  sha: string,
  token: string,
): Promise<string[]> {
  const failed: string[] = [];

  try {
    // Fetch commit statuses (includes SonarQube and other external checks)
    const combinedStatus = (await fetchGitHubAPI(
      `/repos/${owner}/${repo}/commits/${sha}/status`,
      token,
    )) as CombinedStatus;

    for (const status of combinedStatus.statuses) {
      if (status.state === 'failure' || status.state === 'error') {
        failed.push(status.context);
      }
    }

    // Fetch check runs (GitHub Actions checks)
    const checkRuns = (await fetchGitHubAPI(
      `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      token,
    )) as CheckRunsResponse;

    for (const check of checkRuns.check_runs) {
      if (check.conclusion === 'failure' || check.conclusion === 'cancelled') {
        failed.push(check.name);
      }
    }
  } catch (error) {
    console.error('Failed to fetch CI checks:', error);
    // Continue without CI check data rather than failing
  }

  return failed;
}

export function generateCommentBody(
  decision: 'allow' | 'warn' | 'deny',
  violations: ReadonlyArray<{
    code: string;
    message: string;
    severity: string;
    remediation?: string;
  }>,
  summary: string,
): string {
  let decisionEmoji: string;
  if (decision === 'allow') {
    decisionEmoji = '✅';
  } else if (decision === 'warn') {
    decisionEmoji = '⚠️';
  } else {
    decisionEmoji = '❌';
  }

  let commentBody = `## ${decisionEmoji} Policy Decision: ${decision.toUpperCase()}\n\n`;

  if (decision === 'deny' || decision === 'warn') {
    commentBody += '### Reasons\n\n';
    for (const violation of violations) {
      const emoji = violation.severity === 'error' ? '❌' : '⚠️';
      commentBody += `${emoji} **${violation.code}**: ${violation.message}\n`;
    }
    commentBody += '\n';

    const remediations = [
      ...new Set(violations.map((v) => v.remediation).filter(Boolean) as string[]),
    ];
    if (remediations.length > 0) {
      commentBody += '### Remediation\n\n';
      for (const remedy of remediations) {
        commentBody += `- ${remedy}\n`;
      }
      commentBody += '\n';
    }
  }

  commentBody += `<details>\n<summary>Full Policy Summary</summary>\n\n${summary}\n</details>`;
  return commentBody;
}

export async function main(): Promise<number> {
  const event = readGitHubEvent();
  const prBody = event?.pull_request?.body ?? '';
  const baseSha = event?.pull_request?.base?.sha ?? null;
  const headSha = event?.pull_request?.head?.sha ?? null;
  const prNumber = event?.pull_request?.number ?? null;
  const owner = event?.repository?.owner?.login ?? null;
  const repo = event?.repository?.name ?? null;
  // biome-ignore lint/complexity/useLiteralKeys: GitHub sets env vars via index signature
  const token = process.env['GITHUB_TOKEN'] ?? '';

  if (baseSha == null || baseSha === '' || headSha == null || headSha === '') {
    console.error('Policy evaluator: missing PR base/head SHA; cannot compute changed files.');
    // Fail closed: policy is a governance gate.
    return 1;
  }

  const changedFiles = getChangedFilesFromGit(baseSha, headSha);

  // Fetch failed CI checks (including SonarQube)
  let failedCIChecks: string[] = [];
  if (owner != null && repo != null && headSha != null && token !== '') {
    failedCIChecks = await getFailedCIChecks(owner, repo, headSha, token);
  }

  const out = evaluatePolicy({ prBody, changedFiles, failedCIChecks });

  const decisionJsonPath = path.resolve(process.cwd(), 'policy.decision.json');
  const summaryMdPath = path.resolve(process.cwd(), 'policy.summary.md');

  safeWriteUtf8(decisionJsonPath, serializeToJSON(out.result));
  const summary = generateMarkdownSummary(
    out.result,
    out.classification.reasons,
    out.classification.paths,
  );

  safeWriteUtf8(summaryMdPath, summary);

  // Post comment to PR with decision and reasons
  if (owner != null && repo != null && prNumber != null && token !== '') {
    const commentBody = generateCommentBody(out.result.decision, out.result.violations, summary);

    try {
      await postGitHubComment(owner, repo, prNumber, commentBody, token);
      console.log('Posted policy decision comment to PR');
    } catch (error) {
      console.error('Failed to post PR comment:', error);
      // Continue even if comment posting fails
    }
  }

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
  try {
    const code = await main();
    process.exitCode = code;
  } catch (error) {
    console.error('Policy evaluator error:', error);
    process.exitCode = 1;
  }
}
/* c8 ignore stop */
