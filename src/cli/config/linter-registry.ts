/**
 * Political Sphere — Linter Registry
 *
 * Role: Authoritative registry of supported linters.
 *
 * This file is:
 *   - A single source of truth
 *   - Policy-aware but execution-agnostic
 *   - Immutable and side-effect free
 *
 * No logic belongs here.
 */

import { CliError } from '../../errors/errors.ts';

/**
 * Recognized risk tiers assigned to each linter.
 */
export type LinterRisk = 'low' | 'medium' | 'high';

/**
 * Allowed enforcement levels (authoritative) for registry entries.
 */
export const ALLOWED_ENFORCEMENT = ['advisory', 'blocking', 'security'] as const;

/** Enforcement mode accepted by each linter entry. */
export type LinterEnforcement = (typeof ALLOWED_ENFORCEMENT)[number];

/** Execution strategy used by a linter (shell or direct). */
export type LinterExecutionMode = 'direct' | 'shell';

/**
 * Settings required to probe a linter's installed version.
 */
export interface VersionProbe {
  /** Binary used to retrieve the version */
  readonly binary: string;
  /** Arguments passed to the version binary */
  readonly args: readonly string[];
}

/**
 * Canonical description of a supported linter entry.
 */
export interface LinterConfig {
  /** Stable identifier (used by CLI, policy engine, CI) */
  readonly id: string;

  /** Human-readable name (UI only) */
  readonly name: string;

  /** Expected version (used for pinning/verification) */
  readonly expectedVersion?: string;

  /** Optional command to verify the installed version */
  readonly versionProbe?: VersionProbe;

  /** Executable or shell entrypoint */
  readonly binary: string;

  /** Command-line arguments */
  readonly args: readonly string[];

  /** Maximum execution time in milliseconds */
  readonly timeoutMs: number;

  /** Optional pre-execution skip decision */
  readonly skipCheck?: () => Promise<{ skip: boolean; reason?: string }>;

  /** Optional config file required for execution */
  readonly configFile?: string;

  /** Execution strategy */
  readonly mode: LinterExecutionMode;

  /** Governance classification */
  readonly risk: LinterRisk;
  readonly enforcement: LinterEnforcement;

  /** Human-readable description */
  readonly description: string;
}

/**
 * Complex shell command constants used by some linter entries.
 *
 * These are extracted to improve readability and make quoting easier.
 */

// Dynamic config-aware gitleaks command (intentionally uses shell variable expansion).
const GITLEAKS_CMD = `cfg=\${GITLEAKS_CONFIG:-.gitleaks.toml}; if [ -f "$cfg" ]; then gitleaks detect --config "$cfg" --no-banner --redact; else gitleaks detect --no-banner --redact; fi`;

/* Find-and-run commands for YAML, shell scripts, and Dockerfiles */
const YAMLLINT_FIND_CMD = String.raw`find . -type f \( -name '*.yaml' -o -name '*.yml' \) \! -path './.git/*' \! -path './node_modules/*' \! -path './.ps-platform/*' \! -path './dist/*' \! -path './build/*' \! -path './coverage/*' -print0 | xargs -0 yamllint --config-file .yamllint.yml`;

const SHELLCHECK_FIND_CMD = String.raw`PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" find . -maxdepth 10 -type f -name '*.sh' \! -path './.git/*' \! -path './node_modules/*' \! -path './.ps-platform/*' \! -path './dist/*' \! -path './build/*' \! -path './coverage/*' \! -path './.*/*' -print0 2>/dev/null | xargs -0 shellcheck`;

const HADOLINT_FIND_CMD =
  "find . -type f -name 'Dockerfile*' -not -path './.git/*' -exec hadolint --failure-threshold warning {} +";

/**
 * Authoritative linter registry
 */
export const LINTER_REGISTRY: readonly LinterConfig[] = [
  {
    id: 'gitleaks',
    name: 'Gitleaks',
    binary: 'sh',
    args: ['-c', GITLEAKS_CMD],
    timeoutMs: 60_000,
    configFile: '.gitleaks.toml',
    mode: 'shell',
    risk: 'high',
    enforcement: 'security',
    description: 'Secret detection and leak prevention',
  },

  {
    id: 'semgrep',
    name: 'Semgrep',
    binary: 'semgrep',
    args: [
      'scan',
      '--config',
      '.semgrep.yml',
      '--error',
      '--disable-version-check',
      '--metrics',
      'off',
      '.',
    ],
    timeoutMs: 120_000,
    mode: 'direct',
    risk: 'high',
    enforcement: 'security',
    description: 'Static analysis for security and code quality',
  },

  {
    id: 'osv-scanner',
    name: 'OSV-Scanner',
    binary: 'osv-scanner',
    args: ['--recursive', '.'],
    timeoutMs: 120_000,
    mode: 'direct',
    risk: 'high',
    enforcement: 'security',
    description: 'Vulnerability scanning for dependencies',
  },

  {
    id: 'biome',
    name: 'Biome',
    binary: 'biome',
    args: ['check', '.'],
    timeoutMs: 60_000,
    mode: 'direct',
    risk: 'medium',
    enforcement: 'blocking',
    description: 'Fast linter and formatter',
  },

  {
    id: 'eslint',
    name: 'ESLint',
    binary: 'eslint',
    args: ['.'],
    timeoutMs: 90_000,
    mode: 'direct',
    risk: 'medium',
    enforcement: 'blocking',
    description: 'TypeScript- and ecosystem-aware linting',
  },

  {
    id: 'typescript',
    name: 'TypeScript',
    binary: 'tsc',
    args: ['--noEmit'],
    timeoutMs: 120_000,
    mode: 'direct',
    risk: 'medium',
    enforcement: 'blocking',
    description: 'Static type checking',
  },

  {
    id: 'knip',
    name: 'Knip',
    binary: 'knip',
    args: [],
    timeoutMs: 60_000,
    mode: 'direct',
    risk: 'low',
    enforcement: 'blocking',
    description: 'Dead code and dependency analysis',
  },

  {
    id: 'markdownlint',
    name: 'Markdownlint',
    binary: 'markdownlint-cli2',
    args: ['**/*.md', '#node_modules'],
    timeoutMs: 30_000,
    mode: 'direct',
    risk: 'low',
    enforcement: 'advisory',
    description: 'Markdown correctness and style',
  },

  {
    id: 'cspell',
    name: 'CSpell',
    binary: 'cspell',
    args: ['lint', '--no-progress', '**/*'],
    timeoutMs: 60_000,
    mode: 'direct',
    risk: 'low',
    enforcement: 'advisory',
    description: 'Spell checking',
  },

  {
    id: 'jscpd',
    name: 'JSCPD',
    binary: 'jscpd',
    args: ['--config', '.jscpd.json'],
    timeoutMs: 60_000,
    mode: 'direct',
    risk: 'medium',
    enforcement: 'blocking',
    description: 'Copy–paste detection',
  },

  {
    id: 'actionlint',
    name: 'Actionlint',
    binary: 'actionlint',
    args: ['-shellcheck='],
    timeoutMs: 30_000,
    mode: 'direct',
    risk: 'high',
    enforcement: 'security',
    description: 'GitHub Actions workflow validation',
  },

  {
    id: 'yamllint',
    name: 'Yamllint',
    binary: 'sh',
    args: ['-c', YAMLLINT_FIND_CMD],
    timeoutMs: 30_000,
    mode: 'shell',
    risk: 'medium',
    enforcement: 'blocking',
    description: 'YAML syntax and structure validation',
  },

  {
    id: 'shellcheck',
    name: 'ShellCheck',
    binary: 'sh',
    args: ['-c', SHELLCHECK_FIND_CMD],
    timeoutMs: 30_000,
    mode: 'shell',
    risk: 'high',
    enforcement: 'security',
    description: 'Shell script correctness and safety',
  },

  {
    id: 'hadolint',
    name: 'Hadolint',
    binary: 'sh',
    args: ['-c', HADOLINT_FIND_CMD],
    timeoutMs: 30_000,
    mode: 'shell',
    risk: 'high',
    enforcement: 'security',
    description: 'Dockerfile security and best practices',
  },
] as const;

/**
 * Map keyed by linter id for fast lookup.
 *
 * Exported to match README guidance and keep consumers gated around this helper.
 */
export const LINTER_MAP: ReadonlyMap<string, LinterConfig> = new Map(
  LINTER_REGISTRY.map((l) => [l.id, l]) as readonly [string, LinterConfig][],
);

/* -------------------------------------------------------------------------- */
/* Registry validation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Validate registry invariants such as unique ids and required fields.
 *
 * @param registry - Registry snapshot to validate before usage.
 * @throws {CliError} when an invariant is violated.
 */
function assertValidRegistry(registry: readonly LinterConfig[]): void {
  const ids = new Set<string>();

  for (const linter of registry) {
    if (ids.has(linter.id)) {
      throw new CliError('CLI_INVALID_ARGUMENT', `Duplicate linter id detected: ${linter.id}`);
    }

    ids.add(linter.id);

    if (linter.timeoutMs <= 0) {
      throw new CliError(
        'CLI_INVALID_ARGUMENT',
        `Timeout must be positive for linter: ${linter.id}`,
      );
    }

    if (linter.expectedVersion?.trim().length === 0) {
      throw new CliError(
        'CLI_INVALID_ARGUMENT',
        `expectedVersion must be non-empty when specified for: ${linter.id}`,
      );
    }

    if (linter.expectedVersion !== undefined && linter.versionProbe === undefined) {
      throw new CliError(
        'CLI_INVALID_ARGUMENT',
        `versionProbe must be provided when expectedVersion is set for: ${linter.id}`,
      );
    }
  }
}

// Exposed for tests to validate registry invariants without reloading the module.
export const __test__assertValidRegistry = assertValidRegistry;

assertValidRegistry(LINTER_REGISTRY);

/* -------------------------------------------------------------------------- */
/* Accessors                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Return the linter config for the provided identifier.
 *
 * @param id - Stable linter id to look up.
 * @returns The matching config, or undefined when unknown.
 */
export function getLinterById(id: string): LinterConfig | undefined {
  return LINTER_MAP.get(id);
}

/**
 * Return every configured linter id, preserving registry ordering.
 *
 * @returns Ordered array of active linter identifiers.
 */
export function getAllLinterIds(): readonly string[] {
  // Use the map to preserve registry ordering while benefiting from map semantics.
  return [...LINTER_MAP.keys()];
}
