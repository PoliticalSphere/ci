/**
 * Political Sphere — Linter Test Fixtures
 *
 * Role:
 *   Provide test fixtures for linter configurations.
 *
 * Responsibilities:
 *   - Define mock linter configurations
 *   - Support various test scenarios
 *   - Maintain type compatibility with production linters
 *
 * This file is:
 *   - Test-only infrastructure
 *   - Type-safe and extensible
 *   - Immutable fixture data
 */

import type { LinterConfig } from '../cli/linters.ts';

/**
 * Extended linter config for testing with additional properties
 */
export interface LinterTestConfig extends LinterConfig {
  /** Simulate process output in tests */
  simulateOutput?: string;
  /** Simulate process error in tests */
  simulateError?: Error;
  /** Exit code to simulate */
  simulateExitCode?: number;
}

/**
 * Create a minimal valid linter config
 * @param {Partial<LinterConfig>} [overrides] - Partial config to override defaults
 * @returns {LinterConfig} Valid linter config
 */
export function createLinterConfig(overrides: Partial<LinterConfig> = {}): LinterConfig {
  return {
    id: 'test-linter',
    name: 'Test Linter',
    binary: 'printf',
    args: [],
    timeoutMs: 10_000,
    mode: 'direct',
    risk: 'low',
    enforcement: 'advisory',
    description: 'Test linter for unit testing',
    ...overrides,
  };
}

/**
 * Create a test linter config with simulation options
 * @param {Partial<LinterTestConfig>} [overrides] - Partial config including simulation options
 * @returns {LinterTestConfig} Test linter config
 */
export function createMockLinterConfig(
  overrides: Partial<LinterTestConfig> = {},
): LinterTestConfig {
  const config: LinterTestConfig = {
    ...createLinterConfig(overrides),
    simulateOutput: 'test output',
    simulateExitCode: 0,
    ...overrides,
  };
  return config;
}
