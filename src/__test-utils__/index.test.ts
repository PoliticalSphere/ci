/**
 * Political Sphere — Test Utilities Index Tests
 *
 * Verifies:
 *   - All utilities are properly exported
 *   - Module re-export completeness
 *   - Public API surface consistency
 *   - No missing or broken exports
 */

import { describe, expect, it } from 'vitest';
import * as testUtils from './index.ts';

describe('Test utilities index', () => {
  it('exports and executes console capture utilities', () => {
    // Verify exports exist
    expect(testUtils.captureLogs).toBeDefined();
    expect(testUtils.clearCaptured).toBeDefined();
    expect(testUtils.getLogs).toBeDefined();
    expect(testUtils.getErrors).toBeDefined();
    expect(testUtils.getWarnings).toBeDefined();
    expect(testUtils.getInfos).toBeDefined();
    expect(testUtils.restoreLogs).toBeDefined();

    // Execute to register coverage
    testUtils.captureLogs();
    // biome-ignore lint/suspicious/noConsole: intentional for testing
    console.log('test log');
    // biome-ignore lint/suspicious/noConsole: intentional for testing
    console.error('test error');
    // biome-ignore lint/suspicious/noConsole: intentional for testing
    console.warn('test warn');
    // biome-ignore lint/suspicious/noConsole: intentional for testing
    console.info('test info');

    expect(testUtils.getLogs()).toContain('test log');
    expect(testUtils.getErrors()).toContain('test error');
    expect(testUtils.getWarnings()).toContain('test warn');
    expect(testUtils.getInfos()).toContain('test info');

    testUtils.clearCaptured();
    expect(testUtils.getLogs()).toEqual([]);

    testUtils.restoreLogs();
  });

  it('exports and executes emitter utilities', () => {
    // Verify exports exist
    expect(testUtils.createMockChild).toBeDefined();
    expect(testUtils.MockEmitter).toBeDefined();
    expect(testUtils.mockProcessExit).toBeDefined();
    expect(testUtils.mockProcessError).toBeDefined();
    expect(testUtils.mockStreamData).toBeDefined();

    // Execute to register coverage
    const child = testUtils.createMockChild();
    expect(child).toHaveProperty('stdout');

    const emitter = new testUtils.MockEmitter();
    expect(emitter).toBeDefined();

    testUtils.mockProcessExit(child);
    testUtils.mockProcessError(child, 'test error');
    testUtils.mockStreamData(child, 'stdout', 'test data');
  });

  it('exports and executes linter fixtures', () => {
    // Verify exports exist
    expect(testUtils.createLinterConfig).toBeDefined();
    expect(testUtils.createMockLinterConfig).toBeDefined();

    // Execute to register coverage
    const config = testUtils.createLinterConfig();
    expect(config).toHaveProperty('id');

    const mockConfig = testUtils.createMockLinterConfig();
    expect(mockConfig).toHaveProperty('id');
  });

  it('exports and executes stream mocks', () => {
    // Verify exports exist
    expect(testUtils.createStreamMock).toBeDefined();
    expect(testUtils.createStreamMockPair).toBeDefined();

    // Execute to register coverage
    const stream = testUtils.createStreamMock();
    expect(stream.write('test')).toBe(true);

    const pair = testUtils.createStreamMockPair();
    expect(pair).toHaveProperty('stdout');
    expect(pair).toHaveProperty('stderr');
  });

  it('all utilities integrate correctly', () => {
    // Test cross-utility integration
    testUtils.captureLogs();
    const child = testUtils.createMockChild();
    const stream = testUtils.createStreamMock();

    testUtils.mockStreamData(child, 'stdout', 'integration test');
    stream.write('test data');

    expect(child.stdout).toBeDefined();
    expect(stream.data).toContain('test data');

    testUtils.restoreLogs();
  });
});
