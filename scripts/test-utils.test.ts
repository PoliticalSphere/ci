/**
 * Tests for script execution helpers.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanupTempDirSync,
  createTempDirSync,
  createTempScript,
} from '../src/__test-utils__/index.ts';
import { parseExecError, runScript, runScriptWithEnv } from './test-utils.ts';

describe('parseExecError', () => {
  it('returns defaults when error has no properties', () => {
    const result = parseExecError(new Error('test'));
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(1);
  });

  it('uses stdout when provided', () => {
    const error = Object.assign(new Error('test'), { stdout: 'output' });
    const result = parseExecError(error);
    expect(result.stdout).toBe('output');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(1);
  });

  it('uses stderr when provided', () => {
    const error = Object.assign(new Error('test'), { stderr: 'error output' });
    const result = parseExecError(error);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('error output');
    expect(result.code).toBe(1);
  });

  it('uses code when provided', () => {
    const error = Object.assign(new Error('test'), { code: 42 });
    const result = parseExecError(error);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(42);
  });

  it('uses all properties when provided', () => {
    const error = Object.assign(new Error('test'), {
      stdout: 'out',
      stderr: 'err',
      code: 5,
    });
    const result = parseExecError(error);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
    expect(result.code).toBe(5);
  });
});

describe('runScript', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDirSync('test-scripts-');
  });

  afterEach(() => {
    cleanupTempDirSync(tempDir);
  });

  it('handles successful script execution with stdout', async () => {
    const script = createTempScript(tempDir, 'success', '#!/bin/bash\nprintf "hello world\\n"');
    const result = await runScript(script);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('hello world');
    expect(result.stderr).toBe('');
  });

  it('handles script execution with stderr', async () => {
    const script = createTempScript(
      tempDir,
      'stderr',
      '#!/bin/bash\nprintf "error message\\n" >&2\nexit 0',
    );
    const result = await runScript(script);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('error message');
  });

  it('handles script failure with non-zero exit code', async () => {
    const script = createTempScript(tempDir, 'fail', '#!/bin/bash\nexit 42');
    const result = await runScript(script);
    expect(result.code).toBe(42);
  });

  it('handles script with both stdout and stderr', async () => {
    const script = createTempScript(
      tempDir,
      'mixed',
      '#!/bin/bash\nprintf "output\\n"\nprintf "error\\n" >&2\nexit 5',
    );
    const result = await runScript(script);
    expect(result.code).toBe(5);
    expect(result.stdout).toContain('output');
    expect(result.stderr).toContain('error');
  });

  it('handles script with arguments', async () => {
    const script = createTempScript(tempDir, 'args', '#!/bin/bash\nprintf "%s\\n" "$1"');
    const result = await runScript(script, ['test-arg']);
    expect(result.stdout).toContain('test-arg');
    expect(result.code).toBe(0);
  });

  it('handles nonexistent script', async () => {
    const result = await runScript('/nonexistent/script.sh');
    expect(result.code).not.toBe(0);
  });
});

describe('runScriptWithEnv', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDirSync('test-scripts-env-');
  });

  afterEach(() => {
    cleanupTempDirSync(tempDir);
  });

  it('passes env to successful script', async () => {
    const script = createTempScript(
      tempDir,
      'env-success',
      '#!/bin/bash\nprintf "%s\\n" "FOO=$FOO"',
    );
    const result = await runScriptWithEnv(script, [], { FOO: 'bar' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('FOO=bar');
  });

  it('captures stdout and non-zero code on failure path', async () => {
    const script = createTempScript(
      tempDir,
      'env-fail',
      '#!/bin/bash\nprintf "%s\\n" "FOO=$FOO"; exit 9',
    );
    const result = await runScriptWithEnv(script, [], { FOO: 'baz' });
    expect(result.code).toBe(9);
    expect(result.stdout).toContain('FOO=baz');
  });
});
