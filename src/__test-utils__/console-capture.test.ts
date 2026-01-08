/**
 * Political Sphere — Console Capture Tests
 *
 * Verifies:
 *   - Console output capture functionality
 *   - Multiple console method mocking (log, error, warn, info)
 *   - Output restoration and cleanup
 *   - Isolated test execution
 */

import { describe, expect, it } from 'vitest';
import {
  captureLogs,
  clearCaptured,
  getErrors,
  getInfos,
  getLogs,
  getWarnings,
  restoreLogs,
} from './console-capture.ts';

const startCapture = (): (() => void) => {
  captureLogs();
  return restoreLogs;
};

const snapshotConsole = () => ({
  // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
  log: console.log,
  // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
  error: console.error,
  // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
  warn: console.warn,
  // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
  info: console.info,
});

describe('Console capture', () => {
  it('captures console.log output', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('test message');
    expect(getLogs()).toContain('test message');
    restore();
  });

  it('captures console.error output', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.error('error message');
    expect(getErrors()).toContain('error message');
    restore();
  });

  it('captures console.warn output', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.warn('warning message');
    expect(getWarnings()).toContain('warning message');
    restore();
  });

  it('captures console.info output', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.info('info message');
    expect(getInfos()).toContain('info message');
    restore();
  });

  it('restores original console methods', () => {
    const original = snapshotConsole();
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('captured');
    restore();

    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.log).toBe(original.log);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.error).toBe(original.error);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.warn).toBe(original.warn);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.info).toBe(original.info);
  });

  it('captures multiple log messages', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('first');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('second');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('third');
    const logs = getLogs();
    expect(logs).toContain('first');
    expect(logs).toContain('second');
    expect(logs).toContain('third');
    restore();
  });

  it('clears captured logs between sessions', () => {
    let restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('first session');
    restore();

    restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('second session');
    const logs = getLogs();
    expect(logs).toContain('second session');
    expect(logs).not.toContain('first session');
    restore();
  });

  it('clears all captured output with clearCaptured()', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('log');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.error('error');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.warn('warn');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.info('info');
    clearCaptured();
    expect(getLogs()).toHaveLength(0);
    expect(getErrors()).toHaveLength(0);
    expect(getWarnings()).toHaveLength(0);
    expect(getInfos()).toHaveLength(0);
    restore();
  });

  it('supports multiple capture/restore cycles', () => {
    // First cycle
    let restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('first');
    restore();

    // Second cycle - should work correctly after state cleanup
    restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('second');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.error('error-second');
    expect(getLogs()).toEqual(['second']);
    expect(getErrors()).toEqual(['error-second']);
    restore();

    // Third cycle
    restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.warn('third-warn');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.info('third-info');
    expect(getWarnings()).toEqual(['third-warn']);
    expect(getInfos()).toEqual(['third-info']);
    restore();
  });

  it('restoreLogs handles being called without prior captureLogs', () => {
    const original = snapshotConsole();

    // Calling restoreLogs without captureLogs should not throw or change console
    restoreLogs();

    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.log).toBe(original.log);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.error).toBe(original.error);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.warn).toBe(original.warn);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    expect(console.info).toBe(original.info);
  });

  it('captures multiple arguments and joins them with spaces', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('a', 'b', 'c');
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.error('error', 'with', 'multiple', 'parts');
    expect(getLogs()).toEqual(['a b c']);
    expect(getErrors()).toEqual(['error with multiple parts']);
    restore();
  });

  it('captures non-string arguments and converts them to strings', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log(42);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log(true);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log(null);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log(undefined);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log({ foo: 'bar' });
    const logs = getLogs();
    expect(logs[0]).toBe('42');
    expect(logs[1]).toBe('true');
    expect(logs[2]).toBe('null');
    expect(logs[3]).toBe('undefined');
    expect(logs[4]).toBe('[object Object]');
    restore();
  });

  it('handles console calls with no arguments', () => {
    const restore = startCapture();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.error();
    expect(getLogs()).toEqual(['']);
    expect(getErrors()).toEqual(['']);
    restore();
  });

  it('handles double captureLogs by resetting state', () => {
    captureLogs();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('first');

    // Call captureLogs again without restoring
    captureLogs();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('second');

    // Should only have second log (first was cleared)
    expect(getLogs()).toEqual(['second']);
    restoreLogs();
  });

  it('returns copies of captured data, not references', () => {
    captureLogs();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('test');

    const logs1 = getLogs();
    logs1.push('modified');

    const logs2 = getLogs();

    // logs2 should not contain the modification
    expect(logs2).toEqual(['test']);
    expect(logs2).not.toContain('modified');
    restoreLogs();
  });

  it('captures mixed argument types in single call', () => {
    captureLogs();
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.log('string', 123, true, null);
    // biome-ignore lint/suspicious/noConsole: intentional for testing console capture
    console.warn('warn:', { code: 'ERR' }, false);
    expect(getLogs()[0]).toBe('string 123 true null');
    expect(getWarnings()[0]).toBe('warn: [object Object] false');
    restoreLogs();
  });
});
