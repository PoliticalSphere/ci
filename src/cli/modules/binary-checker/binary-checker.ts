/**
 * Binary availability and version checking utilities.
 * Handles verification that linter binaries exist and meet version requirements.
 */

import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { BinaryError } from '../../../errors/errors.ts';

/** Default timeout for version probes. */
const TIMEOUT_MS = 10_000;
/** Maximum number of bytes collected when probing for a version string. */
const MAX_VERSION_OUTPUT_BYTES = 8 * 1024;

/** Known Windows directories to use when searching for binaries. */
const WINDOWS_BASE_DIRS = [String.raw`C:\Windows\System32`, String.raw`C:\Windows`] as const;
/** Known POSIX directories to include in the binary search path (plus PATH entries). */
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

/**
 * Enumerate directories used when searching for binaries.
 */
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

/**
 * Build candidate paths for a binary by combining base directories with extensions.
 */
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

/**
 * Attempt to resolve a candidate path by ensuring it exists and is a file.
 */
async function resolveCandidate(candidate: string, mode: number): Promise<string | null> {
  try {
    await access(candidate, mode);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- candidate is a computed path from registry/search
    const stats = await stat(candidate);
    if (!stats.isFile()) {
      return null;
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- candidate is a computed path from registry/search
    return await realpath(candidate);
  } catch {
    return null;
  }
}

/**
 * Resolve a binary name to an absolute filesystem path by searching common
 * directories, `node_modules/.bin`, and entries from `process.env.PATH`.
 *
 * Returns the fully-resolved path when found, or `null` if the binary
 * cannot be located.
 */
export async function resolveBinary(binary: string): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const baseDirs = getBaseDirs(isWindows);
  const candidates = getCandidates(binary, isWindows, baseDirs);
  const mode = isWindows ? constants.F_OK : constants.X_OK;

  for (const candidate of candidates) {
    const resolved = await resolveCandidate(candidate, mode);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

/**
 * Check whether the given binary is available on the host system.
 *
 * Returns `true` when `resolveBinary` finds a usable executable, otherwise
 * `false`.
 */
export async function checkBinaryExists(binary: string): Promise<boolean> {
  return (await resolveBinary(binary)) !== null;
}

/**
 * Run a short-lived probe process to capture a binary's version output.
 *
 * `args` should be the flags that cause the binary to print version
 * information (e.g. `['--version']`). The probe will be killed when the
 * timeout is reached or if the binary produces excessive output.
 *
 * Resolves with the combined stdout/stderr string on success, or rejects
 * with a `BinaryError` on failure.
 */
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
    let output = '';
    let totalBytes = 0;

    const pushChunk = (chunk: Buffer): void => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_VERSION_OUTPUT_BYTES) {
        proc.kill('SIGKILL');
        reject(
          new BinaryError(
            'BINARY_VERSION_PROBE_FAILED',
            `Version probe output exceeded ${MAX_VERSION_OUTPUT_BYTES} bytes`,
          ),
        );
        return;
      }
      output += chunk.toString('utf8');
    };

    proc.stdout.on('data', pushChunk);
    proc.stderr.on('data', pushChunk);

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
      resolve(output);
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

/**
 * Ensure the installed linter binary exposes an output that includes the
 * configured `expectedVersion`. If `expectedVersion` is omitted, set to
 * `'0.0.0'`, or no `versionProbe` is provided the check is skipped.
 *
 * Throws `BinaryError` when the binary is missing or the version output
 * does not contain the expected version string.
 */
export async function verifyLinterVersion(config: {
  readonly id: string;
  readonly expectedVersion?: string;
  readonly versionProbe?: { readonly binary: string; readonly args: readonly string[] };
}): Promise<null> {
  // Support '0.0.0' as a sentinel meaning "no pinned version". This allows
  // registries to declare a placeholder without causing runtime failures when
  // the actual binary version differs (useful during development and CI).
  if (config.expectedVersion === undefined || config.versionProbe === undefined) {
    return null;
  }

  if (config.expectedVersion === '0.0.0') {
    return null;
  }

  const { binary, args } = config.versionProbe;

  const resolvedBinary = await resolveBinary(binary);
  if (resolvedBinary === null) {
    throw new BinaryError('BINARY_NOT_FOUND', `Binary not found for version probe: ${binary}`, {
      details: { binary },
    });
  }

  const output = await runVersionProbe(resolvedBinary, args);
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

/**
 * Determine which linters are missing on the current PATH.
 *
 * Returns every linter id whose binary could not be resolved.
 */
export async function verifyAllLinterBinaries(
  linters: readonly { readonly id: string; readonly binary: string }[],
): Promise<readonly string[]> {
  const missing: string[] = [];
  for (const l of linters) {
    if ((await resolveBinary(l.binary)) === null) {
      missing.push(l.id);
    }
  }
  return missing;
}
