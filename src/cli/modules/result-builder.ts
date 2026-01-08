/**
 * Result building and status determination.
 * Handles creation of result objects and status determination based on exit codes.
 */

import type { LinterConfig, LinterResult, LinterStatus } from './types.ts';

export interface ResultContext {
  readonly linter: LinterConfig;
  readonly logPath: string;
  readonly start: number;
}

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

export async function determineStatus(
  linterId: string,
  exitCode: number,
  logPath: string,
  detectKnipFindings?: (path: string) => Promise<boolean>,
): Promise<LinterStatus> {
  // Special handling for linters that may exit 0 but still have findings
  if (linterId === 'knip' && detectKnipFindings) {
    const hasFindings = await detectKnipFindings(logPath);
    return exitCode === 0 && !hasFindings ? 'PASS' : 'FAIL';
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
