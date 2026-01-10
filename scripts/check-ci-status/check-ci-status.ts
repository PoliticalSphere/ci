/**
 * PoliticalSphere CI — Status Aggregator (TypeScript)
 *
 * Evaluates CI job results and determines overall pass/fail status.
 */

import process from 'node:process';

/**
 * CLI usage text shown when `--help` or invalid arguments are provided.
 *
 * This string is printed to stdout by `evaluateArgs` when the user requests
 * help or when the argument count is incorrect.
 */
const USAGE = `Usage:
  check-ci-status [--debug] <secrets> <pinning> <lint> <eslint> <types> <knip> <duplication> <tests> <policy>

Arguments:
  All arguments should be GitHub Actions job result strings: success, failure, cancelled, skipped

Options:
  -h, --help    Show this help and exit
  --debug       Enable trace output (or set CHECK_CI_STATUS_DEBUG=1)

Examples:
  check-ci-status success success success success success success success success success
  CHECK_CI_STATUS_DEBUG=1 check-ci-status success success success success success success success success success
  check-ci-status --debug success success success success success success success success success
`;

/** Human-readable labels for the ordered CI job arguments. */
const JOB_LABELS = [
  'Secrets Detection',
  'Action Pinning',
  'Biome',
  'ESLint',
  'TypeScript',
  'knip',
  'Duplication',
  'Tests',
  'Policy',
] as const;

/** Valid job result strings produced by GitHub Actions. */
type JobStatus = 'success' | 'failure' | 'cancelled' | 'skipped';

/** Tuple representing the two trust-boundary checks: [secrets, pinning]. */
type TrustStatuses = [JobStatus, JobStatus];

/**
 * Tuple representing the quality checks in the canonical order used by the
 * aggregator: [lint, eslint, types, knip, duplication, tests, policy].
 */
type QualityStatuses = [
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
];

/** Result returned by `evaluateArgs` describing outputs and exit code. */
type EvaluateResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** Options controlling evaluation behavior. */
type EvaluateOptions = {
  /** Enable debug/trace output. */
  debug?: boolean;
};

/**
 * Return a debug line when tracing is enabled.
 *
 * Kept side-effect free: callers append this value to stderr when appropriate.
 */
function debugLog(enabled: boolean, message: string): string {
  // eslint-disable-next-line sonarjs/no-selector-parameter -- Simple debug flag is appropriate here
  return enabled ? `[debug] ${message}\n` : '';
}

/**
 * Format the full CI summary given trust and quality status tuples.
 *
 * This function enforces error precedence: trust-boundary failures are
 * reported and cause a non-zero exit code before quality failures are
 * evaluated. It returns the `stdout` text, any debug `stderr` output, and the
 * numeric exit `code` the CLI should use.
 */
function formatSummary(
  trust: TrustStatuses,
  quality: QualityStatuses,
  debug: boolean,
): { stdout: string; stderr: string; code: number } {
  const [secrets, pinning] = trust;
  const [lint, eslint, types, knip, duplication, tests, policy] = quality;

  const lines = [
    '=== CI Results ===',
    'Trust Boundary Checks:',
    `  Secrets Detection: ${secrets}`,
    `  Action Pinning: ${pinning}`,
    '',
    'Quality Checks:',
    `  Biome: ${lint}`,
    `  ESLint: ${eslint}`,
    `  TypeScript: ${types}`,
    `  knip: ${knip}`,
    `  Duplication: ${duplication}`,
    `  Tests: ${tests}`,
    `  Policy: ${policy}`,
  ];

  const trustFailures: string[] = [];
  if (secrets !== 'success') {
    trustFailures.push(`  - Secrets Detection: ${secrets}`);
  }
  if (pinning !== 'success') {
    trustFailures.push(`  - Action Pinning: ${pinning}`);
  }

  const qualityFailures: string[] = [];
  if (lint !== 'success') {
    qualityFailures.push(`  - Biome: ${lint}`);
  }
  if (eslint !== 'success') {
    qualityFailures.push(`  - ESLint: ${eslint}`);
  }
  if (types !== 'success') {
    qualityFailures.push(`  - TypeScript: ${types}`);
  }
  if (knip !== 'success') {
    qualityFailures.push(`  - knip: ${knip}`);
  }
  if (duplication !== 'success') {
    qualityFailures.push(`  - Duplication: ${duplication}`);
  }
  if (tests !== 'success') {
    qualityFailures.push(`  - Tests: ${tests}`);
  }
  if (policy !== 'success') {
    qualityFailures.push(`  - Policy: ${policy}`);
  }

  let code = 0;
  const extra: string[] = [];
  const stderr = debugLog(debug, 'printf rendering summary');

  if (trustFailures.length > 0) {
    extra.push(
      '',
      '❌ Trust boundary violations detected!',
      'Failing trust checks:',
      ...trustFailures,
    );
    code = 1;
  } else if (qualityFailures.length > 0) {
    extra.push('', '❌ Quality checks failed!', 'Failing quality checks:', ...qualityFailures);
    code = 1;
  } else {
    extra.push('', '✅ All CI checks passed!');
  }

  return { stdout: [...lines, ...extra, ''].join('\n'), stderr, code };
}

/**
 * Parse CLI arguments and produce an evaluation result.
 *
 * Accepts the argument vector (excluding `node` and script path) and an
 * optional `options` bag. Returns an object suitable for tests and for the
 * `main()` wrapper to print and set process exit status.
 */
export function evaluateArgs(args: string[], options: EvaluateOptions = {}): EvaluateResult {
  const debug = options.debug === true;

  if (args.includes('-h') || args.includes('--help')) {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  let parsedArgs = args;
  let effectiveDebug = debug;
  if (parsedArgs[0] === '--debug') {
    effectiveDebug = true;
    parsedArgs = parsedArgs.slice(1);
  }

  if (parsedArgs.length !== JOB_LABELS.length) {
    const stderr =
      `Error: expected ${JOB_LABELS.length} arguments, got ${parsedArgs.length}\n` +
      'Usage: check-ci-status [--debug] <secrets> <pinning> <lint> <eslint> <types> <knip> <duplication> <tests> <policy>\n';
    return { code: 1, stdout: '', stderr };
  }

  const trust = parsedArgs.slice(0, 2) as TrustStatuses;
  const quality = parsedArgs.slice(2) as QualityStatuses;

  return formatSummary(trust, quality, effectiveDebug);
}

/**
 * CLI entrypoint wrapper.
 *
 * Reads `process.argv` and `CHECK_CI_STATUS_DEBUG` environment variables,
 * invokes `evaluateArgs`, prints outputs to the console, and sets
 * `process.exitCode` accordingly. When executed directly, this function is
 * invoked automatically.
 */
export function main(): void {
  const envDebug =
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript noPropertyAccessFromIndexSignature requires bracket notation
    process.env['CHECK_CI_STATUS_DEBUG'] === '1' ||
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript noPropertyAccessFromIndexSignature requires bracket notation
    process.env['CHECK_CI_STATUS_DEBUG'] === 'true';
  const result = evaluateArgs(process.argv.slice(2), { debug: envDebug });
  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr.trimEnd());
  }
  process.exitCode = result.code;
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
/* c8 ignore stop */
