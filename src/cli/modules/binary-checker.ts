/**
 * Binary availability and version checking utilities.
 * Handles verification that linter binaries exist and meet version requirements.
 */

import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { BinaryError } from '../../errors.ts';

const TIMEOUT_MS = 10_000;

const WINDOWS_BASE_DIRS = [String.raw`C:\Windows\System32`, String.raw`C:\Windows`] as const;
const POSIX_BASE_DIRS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
] as const;

const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat', ''] as const;
const POSIX_EXTENSIONS = [''] as const;

function getBaseDirs(isWindows: boolean): Set<string> {
  const entries: string[] = [path.join(process.cwd(), 'node_modules', '.bin')];

  // @ts-expect-error TS4111: index signature access is required by TypeScript, but dot notation is acceptable here
  const envPath = process.env.PATH;
  if (envPath !== undefined && envPath.length > 0) {
    for (const entry of envPath.split(path.delimiter)) {
      if (entry && path.isAbsolute(entry)) {
        entries.push(entry);
      }
    }
  }

  const defaults = isWindows ? WINDOWS_BASE_DIRS : POSIX_BASE_DIRS;
  entries.push(...defaults);

  return new Set(entries);
}

function getCandidates(binary: string, isWindows: boolean, baseDirs: Set<string>): string[] {
  if (binary.includes('/') || binary.includes('\\')) {
    return [binary];
  }

  const extensions = isWindows ? WINDOWS_EXTENSIONS : POSIX_EXTENSIONS;
  const candidates: string[] = [];
  for (const dir of baseDirs) {
    for (const ext of extensions) {
      candidates.push(path.join(dir, `${binary}${ext}`));
    }
  }
  return candidates;
}

export async function checkBinaryExists(binary: string): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  const baseDirs = getBaseDirs(isWindows);
  const candidates = getCandidates(binary, isWindows, baseDirs);
  const mode = isWindows ? constants.F_OK : constants.X_OK;

  for (const candidate of candidates) {
    try {
      await access(candidate, mode);
      return true;
    } catch {
      // Try next candidate
    }
  }

  return false;
}

export async function runVersionProbe(
  binary: string,
  args: readonly string[],
  timeoutMs = TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
    });
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new BinaryError(
            'BINARY_VERSION_PROBE_FAILED',
            `Version probe failed with exit code ${code}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : String(err);
      reject(
        new BinaryError('BINARY_VERSION_PROBE_FAILED', `Version probe failed: ${message}`, {
          cause: err,
        }),
      );
    });

    controller.signal.addEventListener(
      'abort',
      () => {
        proc.kill('SIGKILL');
        reject(new BinaryError('BINARY_VERSION_PROBE_TIMEOUT', 'Version probe timeout'));
      },
      { once: true },
    );
  });
}

export async function verifyLinterVersion(config: {
  readonly id: string;
  readonly expectedVersion?: string;
  readonly versionProbe?: { readonly binary: string; readonly args: readonly string[] };
}): Promise<null> {
  if (config.expectedVersion === undefined || config.versionProbe === undefined) {
    return null;
  }

  const { binary, args } = config.versionProbe;

  if (!(await checkBinaryExists(binary))) {
    throw new BinaryError('BINARY_NOT_FOUND', `Binary not found for version probe: ${binary}`, {
      details: { binary },
    });
  }

  const output = await runVersionProbe(binary, args);
  const normalized = output.trim();

  if (!normalized.includes(config.expectedVersion)) {
    throw new BinaryError(
      'BINARY_VERSION_MISMATCH',
      `Version mismatch for ${config.id}: expected ${config.expectedVersion}, got "${normalized || 'unknown'}"`,
      {
        details: { expected: config.expectedVersion, actual: normalized || 'unknown' },
      },
    );
  }

  return null;
}
