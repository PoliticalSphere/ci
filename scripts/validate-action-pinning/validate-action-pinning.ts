/**
 * PoliticalSphere CI — Action Pinning Validator
 *
 * Validates that all GitHub Actions in workflow files are pinned to full commit SHAs.
 *
 * Usage:
 *   validate-action-pinning.ts [OPTIONS] [workflows-dir]
 *
 * Options:
 *   --fix         Auto-fix unpinned actions by resolving to latest commit SHA
 *   -h, --help    Show this help and exit
 *
 * Arguments:
 *   workflows-dir - Directory containing workflow files (default: .github/workflows)
 *
 * Exit codes:
 *   0 - All actions properly pinned (or fixed with --fix)
 *   1 - Unpinned actions detected or error
 *
 * Security model:
 *   SHA pinning prevents supply chain attacks by ensuring actions cannot be
 *   silently updated to malicious versions via tag manipulation.
 *   Local actions (./) are exempt from SHA pinning requirements.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const USAGE = `Usage:
  validate-action-pinning.ts [OPTIONS] [workflows-dir]

Options:
  --fix         Auto-fix unpinned actions by resolving to latest commit SHA
  -h, --help    Show this help and exit

Arguments:
  workflows-dir - Directory containing workflow files (default: .github/workflows)

Examples:
  validate-action-pinning.ts
  validate-action-pinning.ts --fix
  validate-action-pinning.ts .github/workflows
`;

interface ActionReference {
  owner: string;
  repo: string;
  actionPath: string;
  repoSlug: string;
  ref: string;
  full: string;
}

interface UnpinnedAction {
  file: string;
  lineNum: number;
  actionRef: string;
}

interface CommitResponse {
  sha?: unknown;
}

function normalizePath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath);
}

function fileExists(filePath: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized from CLI input
  return existsSync(filePath);
}

function readUtf8(filePath: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized from CLI input
  return readFileSync(filePath, 'utf8');
}

function writeUtf8(filePath: string, contents: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized from CLI input
  writeFileSync(filePath, contents, 'utf8');
}

function readDirEntries(dirPath: string): import('node:fs').Dirent[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized from CLI input
  return readdirSync(dirPath, { withFileTypes: true });
}

/**
 * Check if a string is a valid 40-character SHA-1 hash
 */
export function isValidSha(sha: string): boolean {
  return /^[0-9a-f]{40}$/i.test(sha);
}

/**
 * Parse action reference (e.g., "actions/checkout@v3")
 */
export function parseActionRef(actionRef: string): ActionReference | null {
  const atIndex = actionRef.indexOf('@');
  if (atIndex === -1) {
    return null;
  }

  const left = actionRef.slice(0, atIndex);
  const ref = actionRef.slice(atIndex + 1);

  const parts = left.split('/').filter((p) => p.length > 0);
  if (parts.length < 2) {
    return null;
  }

  const owner = parts[0] as string;
  const repo = parts[1] as string;
  const actionPath = parts.slice(2).join('/');
  const repoSlug = `${owner}/${repo}`;

  return { owner, repo, actionPath, repoSlug, ref, full: actionRef };
}

/**
 * Check if an action is a local action (starts with ./ or ../)
 */
export function isLocalAction(actionRef: string): boolean {
  return actionRef.startsWith('./') || actionRef.startsWith('../');
}

/**
 * Result of resolving an action reference to its commit SHA
 */
interface ResolvedAction {
  sha: string;
  owner: string;
  repo: string;
  actionPath: string;
  repoSlug: string;
}

/**
 * Resolve tag/branch to latest commit SHA for an action
 * Returns the SHA and repo info to avoid needing to re-parse the action reference
 */
export async function resolveToSha(actionRef: string): Promise<ResolvedAction | null> {
  const parsed = parseActionRef(actionRef);
  if (!parsed) {
    return null;
  }

  const apiUrl = `https://api.github.com/repos/${parsed.repoSlug}/commits/${parsed.ref}`;

  return new Promise((resolve) => {
    // biome-ignore lint/complexity/useLiteralKeys: env access via index signature
    const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
    const options = {
      headers: {
        'User-Agent': 'validate-action-pinning',
        Accept: 'application/vnd.github.v3+json',
        ...(typeof token === 'string' && token.length > 0
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
    };

    https
      .get(apiUrl, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data) as CommitResponse;
            const parsedSha = json.sha;
            if (typeof parsedSha === 'string' && isValidSha(parsedSha)) {
              resolve({
                sha: parsedSha,
                owner: parsed.owner,
                repo: parsed.repo,
                actionPath: parsed.actionPath,
                repoSlug: parsed.repoSlug,
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => {
        resolve(null);
      });
  });
}

/**
 * Find all workflow files in a directory
 */
export function findWorkflowFiles(workflowsDir: string): string[] {
  if (!fileExists(workflowsDir)) {
    return [];
  }

  try {
    const files = readDirEntries(workflowsDir);
    return files
      .filter(
        (file) => file.isFile() && (file.name.endsWith('.yml') || file.name.endsWith('.yaml')),
      )
      .map((file) => path.join(workflowsDir, file.name));
  } catch {
    return [];
  }
}

/**
 * Extract unpinned actions from a workflow file
 */
export function extractUnpinnedActions(filePath: string): UnpinnedAction[] {
  const content = readUtf8(filePath);
  const lines = content.split('\n');
  const unpinned: UnpinnedAction[] = [];

  for (const [index, line] of lines.entries()) {
    const lineNum = index + 1;

    // Skip comments
    if (/^\s*#/.test(line)) {
      continue;
    }

    // Check for uses: line
    const usesMatch = /uses:\s*(\S+)/.exec(line);
    const actionRef = usesMatch?.[1];

    if (actionRef === undefined) {
      continue;
    }

    // Skip local actions
    if (isLocalAction(actionRef)) {
      continue;
    }

    // Parse action reference
    const parsed = parseActionRef(actionRef);
    if (parsed === null) {
      continue;
    }

    // Check if already pinned to a valid SHA
    if (isValidSha(parsed.ref)) {
      continue;
    }

    // Found an unpinned action
    unpinned.push({ file: filePath, lineNum, actionRef });
  }

  return unpinned;
}

/**
 * Auto-fix unpinned action in a file
 */
export async function fixUnpinnedAction(
  filePath: string,
  actionRef: string,
): Promise<{ success: boolean; newRef?: string }> {
  const resolved = await resolveToSha(actionRef);
  if (resolved === null) {
    return { success: false };
  }

  const left =
    resolved.actionPath.length > 0
      ? `${resolved.repoSlug}/${resolved.actionPath}`
      : resolved.repoSlug;
  const newRef = `${left}@${resolved.sha}`;

  try {
    const content = readUtf8(filePath);

    // Replace only `uses:` lines matching the original ref (avoid mutating comments/strings).
    const escaped = actionRef.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    // `escaped` is constructed by escaping RegExp metacharacters above, so a
    // dynamic RegExp is safe here. We place the disable directive on the
    // RegExp construction line to avoid unused-disable warnings.
    const pattern = String.raw`(^\s*(?:-\s*)?uses:\s*)${escaped}(\s*$)`;
    // eslint-disable-next-line security/detect-non-literal-regexp -- escaped is a sanitized literal
    const re = new RegExp(pattern, 'gm');
    const newContent = content.replace(re, `$1${newRef}$2`);
    writeUtf8(filePath, newContent);
    return { success: true, newRef };
  } catch {
    return { success: false };
  }
}

/**
 * Main validation logic
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Complex but clear validation logic
export async function validate(workflowsDir: string, fixMode: boolean): Promise<number> {
  console.log('Validating GitHub Actions are pinned to commit SHAs...');

  const normalizedWorkflowsDir = normalizePath(workflowsDir);

  // Validate workflows directory exists
  if (!fileExists(normalizedWorkflowsDir)) {
    console.error(`Error: Workflows directory not found: ${normalizedWorkflowsDir}`);
    return 1;
  }

  // Find all workflow files
  const workflowFiles = findWorkflowFiles(normalizedWorkflowsDir);

  if (workflowFiles.length === 0) {
    console.log(`No workflow files found in ${workflowsDir}`);
    return 0;
  }

  let violations = 0;

  // Check each workflow file
  for (const file of workflowFiles) {
    console.log(`Checking ${file}...`);

    const unpinned = extractUnpinnedActions(file);

    for (const { lineNum, actionRef } of unpinned) {
      if (fixMode) {
        console.log(`🔧 Fixing unpinned action at ${file}:${lineNum}: ${actionRef}`);

        const result = await fixUnpinnedAction(file, actionRef);
        if (result.success && result.newRef !== undefined) {
          console.log(`  ✅ Fixed: ${actionRef} → ${result.newRef}`);
        } else {
          console.log(`  ⚠️  Failed to resolve SHA for ${actionRef}`);
          violations++;
        }
      } else {
        console.log(`❌ Found unpinned action at ${file}:${lineNum}: ${actionRef}`);
        violations++;
      }
    }
  }

  if (violations > 0) {
    console.log('');
    console.log('❌ Action pinning violations detected!');
    console.log('All GitHub Actions must be pinned to full commit SHAs (40-char hex).');
    if (!fixMode) {
      console.log('Tip: Run with --fix to automatically resolve unpinned actions.');
    }
    return 1;
  }

  if (fixMode) {
    console.log('✅ All unpinned actions have been fixed');
  } else {
    console.log('✅ All actions are properly pinned to commit SHAs');
  }

  return 0;
}

/**
 * CLI entry point
 */
export async function main(args: string[]): Promise<number> {
  // Help flag handling
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    return 0;
  }

  // Parse --fix flag
  let fixMode = false;
  const filteredArg = args.find((arg) => {
    if (arg === '--fix') {
      fixMode = true;
      return false;
    }
    return true;
  });

  // Parse workflows directory
  const workflowsDir = filteredArg ?? '.github/workflows';

  return await validate(workflowsDir, fixMode);
}

// Run CLI if called directly (ESM-compatible check)
const isMainModule =
  process.argv[1]?.endsWith('validate-action-pinning.ts') === true ||
  process.argv[1]?.endsWith('validate-action-pinning.js') === true;

/* c8 ignore start -- CLI bootstrap code only runs when executed directly */
if (isMainModule) {
  try {
    const args = process.argv.slice(2);
    const exitCode = await main(args);
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- CLI entry point
    process.exit(exitCode);
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- CLI entry point
    process.exit(1);
  }
}
/* c8 ignore stop */
