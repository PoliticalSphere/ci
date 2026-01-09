/**
 * Political Sphere — Test Utilities Index
 *
 * Role:
 *   Centralized export point for all test utilities.
 *
 * Responsibilities:
 *   - Re-export console capture utilities
 *   - Re-export event emitter mocks
 *   - Re-export linter fixtures
 *   - Re-export stream mocks
 *
 * This file is:
 *   - Test-only infrastructure
 *   - Single import source for test utilities
 *   - Pure re-exports with no logic
 */

export {
  captureLogs,
  clearCaptured,
  getErrors,
  getInfos,
  getLogs,
  getWarnings,
  restoreLogs,
} from './console-capture.ts';
export {
  createMockChild,
  type MockChild,
  MockEmitter,
  mockProcessError,
  mockProcessExit,
  mockStreamData,
} from './emitter.ts';
export type { LinterTestConfig } from './linter-fixtures.ts';
export { createLinterConfig, createMockLinterConfig } from './linter-fixtures.ts';
export type { StreamMock } from './stream-mocks.ts';
export { createStreamMock, createStreamMockPair } from './stream-mocks.ts';
export {
  cleanupTempDirSync,
  cleanupTempFile,
  createTempDir,
  createTempDirSync,
  createTempFile,
  createTempScript,
  getTempDir,
} from './temp-utils.ts';
