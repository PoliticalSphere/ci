/**
 * Political Sphere — Mock Factories for CLI Tests
 *
 * Role:
 *   Provide factory functions for common test mocks used in CLI module tests.
 *
 * Purpose:
 *   - Reduce duplication of mock setup across executor, incremental, and other tests
 *   - Centralize mock creation patterns
 *   - Provide type-safe access to commonly mocked modules
 */

import { type MockedFunction, vi } from 'vitest';
import type {
  checkBinaryExists,
  detectKnipFindings,
  determineStatus,
  isTransientError,
  runProcess,
  shouldSkipLinter,
  verifyLinterVersion,
} from '../../../cli/modules/index.ts';

/**
 * Get mocked modules from executor module with default setup
 * Returns an object with all executor module mocks ready for use
 */
export async function getMockedModules(): Promise<{
  shouldSkipLinter: MockedFunction<typeof shouldSkipLinter>;
  checkBinaryExists: MockedFunction<typeof checkBinaryExists>;
  verifyLinterVersion: MockedFunction<typeof verifyLinterVersion>;
  runProcess: MockedFunction<typeof runProcess>;
  determineStatus: MockedFunction<typeof determineStatus>;
  detectKnipFindings: MockedFunction<typeof detectKnipFindings>;
  isTransientError: MockedFunction<typeof isTransientError>;
}> {
  return import('../../../cli/modules/index.ts').then((mod) => ({
    shouldSkipLinter: vi.mocked(mod.shouldSkipLinter),
    checkBinaryExists: vi.mocked(mod.checkBinaryExists),
    verifyLinterVersion: vi.mocked(mod.verifyLinterVersion),
    runProcess: vi.mocked(mod.runProcess),
    determineStatus: vi.mocked(mod.determineStatus),
    detectKnipFindings: vi.mocked(mod.detectKnipFindings),
    isTransientError: vi.mocked(mod.isTransientError),
  }));
}

/**
 * Get mocked logger module with default setup
 */
export async function getMockedLogger(): Promise<{
  appendToLog: MockedFunction<typeof import('../../../cli/observability/logger.ts').appendToLog>;
}> {
  return import('../../../cli/observability/logger.ts').then((mod) => ({
    appendToLog: vi.mocked(mod.appendToLog),
  }));
}

/**
 * Get mocked incremental tracker with default setup
 */
export async function getMockedIncremental(): Promise<{
  getGlobalTracker: MockedFunction<
    typeof import('../../../cli/infrastructure/incremental.ts').getGlobalTracker
  >;
}> {
  // Try several module specifiers to find the mocked export used by tests/importers.
  const candidates = [
    '../../../cli/infrastructure/incremental.ts',
    '../../cli/infrastructure/incremental.ts',
    '../infrastructure/incremental.ts',
    'src/cli/infrastructure/incremental.ts',
  ];

  for (const spec of candidates) {
    try {
      // vi.importMock resolves to the mocked module for the given specifier
      // When the test has mocked a module path that matches the specifier, this
      // should return the mock with spy methods available.

      const mod = await vi.importMock(spec);
      // Access the named export in a typed way to avoid `any` and strict-boolean checks
      const fn = (mod as { getGlobalTracker?: unknown })?.getGlobalTracker;
      if (typeof fn === 'function') {
        return {
          getGlobalTracker: vi.mocked(
            fn as typeof import('../../../cli/infrastructure/incremental.ts').getGlobalTracker,
          ),
        };
      }
    } catch {
      // Ignore and try next candidate
    }
  }

  // Fallback: import the canonical path and return whatever it has
  return import('../../../cli/infrastructure/incremental.ts').then((mod) => ({
    getGlobalTracker: vi.mocked(mod.getGlobalTracker),
  }));
}

/**
 * Create a tracker mock for incremental testing
 */
export function createTrackerMock(
  shouldExecute: boolean,
  reason: string = '',
): {
  getExecutionDecision: MockedFunction<
    (linterId: string) => { shouldExecute: boolean; reason: string }
  >;
} {
  return {
    getExecutionDecision: vi.fn().mockReturnValue({
      shouldExecute,
      reason,
    }),
  };
}
