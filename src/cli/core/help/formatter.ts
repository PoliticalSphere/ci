/**
 * Political Sphere — Help Text Formatter
 *
 * Role:
 *   Format and display help information.
 *
 * Responsibilities:
 *   - Generate formatted help text with available linters
 *   - Escape/sanitize linter IDs for display
 */

import { getAllLinterIds } from '../../config/index.ts';

/**
 * Sanitize a token for inclusion in help output.
 *
 * Removes non-printable or non-ASCII characters to avoid control
 * characters or terminal escape sequences in the help text.
 * @param {string} value - Candidate token to sanitize (e.g. linter id)
 * @returns {string} Sanitized string safe for display in help output
 */
export const escapeHelpToken = (value: string): string =>
  // Keep only printable ASCII characters (remove control chars and emoji)
  value.replaceAll(/[^\u0020-\u007E]/g, '');

/**
 * Static help message template. The placeholder `[LINTERS]` will be
 * replaced with a comma-separated list of available linter ids at
 * runtime by `showHelp()`.
 */
const HELP_MESSAGE = `
Political Sphere — Parallel Linter CLI

USAGE:
  ps-lint [OPTIONS]

OPTIONS:
  --verify-logs         Enable raw byte-for-byte logging (verification mode)
  --log-dir <path>      Directory for log files (default: ./logs)
  --linters <list>      Comma- or space-separated list of linters to run
                        Available: [LINTERS]
  --incremental         Only run linters for changed files (git-aware)
  --clear-cache         Clear all caches before execution
  --verbose             Enable verbose logging (alias: --debug)
  --help                Show this help message
  --version             Show version number

EXAMPLES:
  ps-lint
  ps-lint --verify-logs
  ps-lint --linters gitleaks,biome,eslint
  ps-lint --incremental
  ps-lint --clear-cache
  ps-lint --log-dir ./build/lint-logs

NOTES:
  • Parallel execution uses N-1 CPU cores
  • Incremental mode requires a git repository
  • CI execution is authoritative
  • Logs are deterministic and auditable
`;

/**
 * Build the help message and inject the available linters safely.
 *
 * @returns A formatted help string with sanitized linter ids.
 */
export function showHelp(): string {
  const lintersList = getAllLinterIds()
    .map((id) => escapeHelpToken(id))
    .join(', ');
  return HELP_MESSAGE.replace('[LINTERS]', lintersList);
}
