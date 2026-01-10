/**
 * Test script execution helpers for integration-style tests.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Result shape returned from script execution helpers.
 */
interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Parse error properties with fallback defaults.
 * Extracted for testability.
 *
 * @param error - Error or error-like object from execFile.
 * @returns Parsed execution result.
 */
export function parseExecError(error: unknown): ExecResult {
  const execError = error as { stdout?: string; stderr?: string; code?: number };
  const stdout = execError.stdout ?? '';
  const stderr = execError.stderr ?? '';
  const code = execError.code ?? 1;
  return { stdout, stderr, code };
}

/**
 * Run a script either directly (.sh) or through npx.
 *
 * @param scriptPath - Path to the script to execute.
 * @param args - Arguments to pass to the script.
 * @returns Execution result including stdout, stderr, and exit code.
 */
export async function runScript(
  scriptPath: string,
  args: readonly string[] = [],
): Promise<ExecResult> {
  try {
    const useDirect = path.extname(scriptPath) === '.sh';
    const command = useDirect ? scriptPath : 'npx';
    const commandArgs = useDirect ? [...args] : [scriptPath, ...args];
    const { stdout, stderr } = await execFileAsync(command, commandArgs);
    return { stdout, stderr, code: 0 };
  } catch (error) {
    return parseExecError(error);
  }
}

/**
 * Run a script with additional environment variables.
 *
 * @param scriptPath - Path to the script to execute.
 * @param args - Arguments to pass to the script.
 * @param env - Environment variables to merge with process.env.
 * @returns Execution result including stdout, stderr, and exit code.
 */
export async function runScriptWithEnv(
  scriptPath: string,
  args: readonly string[] = [],
  env: Record<string, string> = {},
): Promise<ExecResult> {
  try {
    const useDirect = path.extname(scriptPath) === '.sh';
    const command = useDirect ? scriptPath : 'npx';
    const commandArgs = useDirect ? [...args] : [scriptPath, ...args];
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      env: { ...process.env, ...env },
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    return parseExecError(error);
  }
}
