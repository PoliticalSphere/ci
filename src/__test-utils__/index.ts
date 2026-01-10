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

export { createLockAcquisitionHandler } from './fixtures/cli/cli-main-fixtures.ts';
export type { LinterTestConfig } from './fixtures/linter/linter-fixtures.ts';
export { createLinterConfig, createMockLinterConfig } from './fixtures/linter/linter-fixtures.ts';
export {
  createTrackerMock,
  getMockedIncremental,
  getMockedLogger,
  getMockedModules,
} from './mocks/cli/test-mocks.ts';
export {
  captureLogs,
  clearCaptured,
  getErrors,
  getInfos,
  getLogs,
  getWarnings,
  restoreLogs,
} from './mocks/console/console-capture.ts';
export { fakeConsole } from './mocks/console/fake-console.ts';
export {
  createMockChild,
  type MockChild,
  MockEmitter,
  mockProcessError,
  mockProcessExit,
  mockStreamData,
} from './mocks/process/emitter.ts';
export type { StreamMock } from './mocks/streams/stream-mocks.ts';
export { createStreamMock, createStreamMockPair } from './mocks/streams/stream-mocks.ts';
export { _createDeferred, createDeferred } from './utils/deferred.ts';
export { restoreEnv, snapshotEnv, withEnv } from './utils/env.ts';
export {
  cleanupTempDirSync,
  cleanupTempFile,
  createTempDir,
  createTempDirSync,
  createTempFile,
  createTempScript,
  getTempDir,
} from './utils/temp-utils.ts';
