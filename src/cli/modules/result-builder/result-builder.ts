/**
 * Result building and status determination utilities used by the executor.
 *
 * Responsibilities:
 *   - Normalize execution metadata into `LinterResult` payloads
 *   - Translate exit codes + specialized detectors into normalized statuses
 *   - Aggregate results into a runtime summary
 */

import type { LinterConfig, LinterResult, LinterStatus } from '../types.ts';

export interface ResultContext {
  readonly linter: LinterConfig;
  readonly logPath: string;
  readonly start: number;
}

/**
 * Create a `LinterResult` value from execution context and status.
 *
 * @param ctx - Execution context including linter metadata and log path.
 * @param status - Status determined for this execution.
 * @param exitCode - Process exit code (often 0/1/null when unavailable).
 * @param error - Optional error message emitted by the linter or executor.
 * @returns Normalized `LinterResult`.
 */
export function buildResult(
  ctx: ResultContext,
  status: LinterStatus,
  exitCode: number | null,
  error?: string,
): LinterResult {
  const result: LinterResult = {
    id: ctx.linter.id,
    name: ctx.linter.name,
    status,
    exitCode,
    duration: Date.now() - ctx.start,
    logPath: ctx.logPath,
  };
  if (error !== undefined) {
    return { ...result, error };
  }
  return result;
}

/**
 * Compute a `LinterStatus` from an exit code and optional detectors.
 *
 * Some linters (e.g. `knip`) exit with code 0 even when discoveries exist,
 * so this helper allows injecting additional detectors to override the raw code.
 *
 * @param linterId - Identifier used to apply linter-specific logic.
 * @param exitCode - Raw process exit code emitted by the linter.
 * @param logPath - Path to the linter log file used by optional detectors.
 * @param detectKnipFindings - Optional helper that inspects the knip log for findings.
 * @returns PASS/FAIL depending on exit code and detector output.
 */
export async function determineStatus(
  linterId: string,
  exitCode: number,
  logPath: string,
  detectKnipFindings?: (path: string) => Promise<boolean>,
): Promise<LinterStatus> {
  // Special handling for linters that may exit 0 but still have findings
  if (linterId === 'knip' && detectKnipFindings) {
    const hasFindings = await detectKnipFindings(logPath);
    return hasFindings ? 'FAIL' : 'PASS';
  }

  if (linterId === 'jscpd') {
    // JSCPD exit code respects the threshold setting; trust it instead of detecting clones
    return exitCode === 0 ? 'PASS' : 'FAIL';
  }

  return exitCode === 0 ? 'PASS' : 'FAIL';
}

export interface ExecutionSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly duration: number;
}

/**
 * Summarize a sequence of `LinterResult` objects into runtime metrics.
 */
export function calculateSummary(
  results: readonly LinterResult[],
  duration: number,
): ExecutionSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    errors: results.filter((r) => r.status === 'ERROR').length,
    duration,
  };
}
