/**
 * Political Sphere — Linter Fixtures Tests
 *
 * Verifies:
 *   - Test fixture creation and configuration
 *   - Default values and overrides
 *   - Type safety and compatibility
 *   - Fixture extensibility
 */

import { describe, expect, it } from 'vitest';
import { createLinterConfig, createMockLinterConfig } from './linter-fixtures.ts';

describe('Linter fixtures', () => {
  describe('createLinterConfig', () => {
    it('creates a minimal valid linter config', () => {
      const config = createLinterConfig();
      expect(config).toMatchObject({
        id: 'test-linter',
        name: 'Test Linter',
        binary: 'printf',
        args: [],
        timeoutMs: 10_000,
        mode: 'direct',
        risk: 'low',
        enforcement: 'advisory',
        description: 'Test linter for unit testing',
      });
    });

    it('allows overriding default values', () => {
      const config = createLinterConfig({
        id: 'custom-linter',
        name: 'Custom Linter',
        binary: 'custom-binary',
        timeoutMs: 5000,
      });
      expect(config.id).toBe('custom-linter');
      expect(config.name).toBe('Custom Linter');
      expect(config.binary).toBe('custom-binary');
      expect(config.timeoutMs).toBe(5000);
    });

    it('preserves non-overridden defaults', () => {
      const config = createLinterConfig({ id: 'override-id' });
      expect(config.id).toBe('override-id');
      expect(config.mode).toBe('direct');
      expect(config.risk).toBe('low');
      expect(config.enforcement).toBe('advisory');
    });
  });

  describe('createMockLinterConfig', () => {
    it('creates a test config with simulation options', () => {
      const config = createMockLinterConfig();
      expect(config.simulateOutput).toBe('test output');
      expect(config.simulateExitCode).toBe(0);
      expect(config.id).toBe('test-linter');
    });

    it('allows overriding simulation options', () => {
      const config = createMockLinterConfig({
        simulateOutput: 'custom output',
        simulateExitCode: 1,
      });
      expect(config.simulateOutput).toBe('custom output');
      expect(config.simulateExitCode).toBe(1);
    });

    it('allows overriding base config and simulation options', () => {
      const error = new Error('test error');
      const config = createMockLinterConfig({
        id: 'mock-linter',
        binary: 'mock-binary',
        simulateError: error,
        simulateExitCode: 2,
      });
      expect(config.id).toBe('mock-linter');
      expect(config.binary).toBe('mock-binary');
      expect(config.simulateError).toBe(error);
      expect(config.simulateExitCode).toBe(2);
    });

    it('includes all base linter config properties', () => {
      const config = createMockLinterConfig();
      expect(config).toHaveProperty('id');
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('binary');
      expect(config).toHaveProperty('args');
      expect(config).toHaveProperty('timeoutMs');
      expect(config).toHaveProperty('mode');
      expect(config).toHaveProperty('risk');
      expect(config).toHaveProperty('enforcement');
    });
  });
});
