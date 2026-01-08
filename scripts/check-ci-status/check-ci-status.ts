/**
 * PoliticalSphere CI — Status Aggregator (TypeScript)
 *
 * Evaluates CI job results and determines overall pass/fail status.
 */

import process from 'node:process';

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

type JobStatus = 'success' | 'failure' | 'cancelled' | 'skipped';

type TrustStatuses = [JobStatus, JobStatus];
type QualityStatuses = [
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
  JobStatus,
];

type EvaluateResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type EvaluateOptions = {
  debug?: boolean;
};

function debugLog(enabled: boolean, message: string): string {
  // eslint-disable-next-line sonarjs/no-selector-parameter -- Simple debug flag is appropriate here
  return enabled ? `[debug] ${message}\n` : '';
}

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
