/**
 * Execution orchestration and coordination
 */

export { executeWithArgs, type MainDeps, type MainResult } from './execution.ts';
export { acquireExecutionLock, type ExecutionLock } from './execution-lock.ts';
export {
  calculateSummary,
  type ExecutionSummary,
  executeLinter,
  executeLintersInParallel,
  type LinterResult,
  type LinterStatus,
} from './executor.ts';
