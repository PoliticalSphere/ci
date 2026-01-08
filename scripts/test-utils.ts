import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Parse error properties with fallback defaults.
 * Extracted for testability.
 */
export function parseExecError(error: unknown): ExecResult {
  const execError = error as { stdout?: string; stderr?: string; code?: number };
  const stdout = execError.stdout ?? '';
  const stderr = execError.stderr ?? '';
  const code = execError.code ?? 1;
  return { stdout, stderr, code };
}

export async function runScript(
  scriptPath: string,
  args: readonly string[] = [],
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('npx', [scriptPath, ...args]);
    return { stdout, stderr, code: 0 };
  } catch (error) {
    return parseExecError(error);
  }
}

export async function runScriptWithEnv(
  scriptPath: string,
  args: readonly string[] = [],
  env: Record<string, string> = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('npx', [scriptPath, ...args], {
      env: { ...process.env, ...env },
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    return parseExecError(error);
  }
}
