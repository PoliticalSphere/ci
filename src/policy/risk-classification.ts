/**
 * Policy Engine — Risk Classification
 *
 * Evaluates changed files and classifies changes into risk tiers.
 * Risk classification is deterministic, explicit, and order-independent.
 *
 * This module is intentionally:
 * - declarative (policy expressed as data)
 * - auditable (human-readable reasons)
 * - conservative (fail closed on ambiguity)
 */

export type RiskTier = 'low' | 'medium' | 'high';

export interface RiskClassification {
  readonly tier: RiskTier;
  readonly reasons: readonly string[];
  readonly paths: readonly string[];
}

/**
 * ============================================
 * High-Risk Path Patterns
 * --------------------------------------------
 * Changes that affect trust boundaries,
 * governance, execution, or supply chain.
 * ============================================
 */
/**
 * High-risk path patterns used by the classifier.
 *
 * Exported for external tooling (e.g., editors, bots) that
 * wish to surface or reuse the same trust-boundary heuristics.
 *
 * Note: Files may match multiple patterns (e.g., a shell script in scripts/).
 * The classifier treats any match as high risk; double-classification is benign.
 */
export interface HighRiskRule {
  readonly pattern: RegExp;
  readonly category:
    | 'workflows'
    | 'actions'
    | 'orchestration'
    | 'governance'
    | 'supply-chain'
    | 'security-config'
    | 'containers'
    | 'automation'
    | 'scripts';
  readonly description: string;
}

/**
 * High-risk rules with categories and descriptions.
 * Provides structured metadata while preserving the legacy pattern export.
 */
export const HIGH_RISK_RULES: readonly HighRiskRule[] = [
  // GitHub workflows and actions
  {
    pattern: /^\.github\/workflows\//,
    category: 'workflows',
    description: 'GitHub Actions workflows',
  },
  { pattern: /^\.github\/actions\//, category: 'actions', description: 'Reusable GitHub Actions' },

  // Orchestration and tooling
  {
    pattern: /^tools\//,
    category: 'orchestration',
    description: 'Tooling scripts and orchestration',
  },
  {
    pattern: /^scripts\//,
    category: 'orchestration',
    description: 'Project scripts and orchestration',
  },

  // Governance and policy
  { pattern: /^policies\//, category: 'governance', description: 'Policy files' },
  { pattern: /^governance\//, category: 'governance', description: 'Governance assets' },
  { pattern: /^contracts\//, category: 'governance', description: 'Contracts affecting trust' },
  {
    pattern: /^ai-guardrails\//,
    category: 'governance',
    description: 'AI guardrails and constraints',
  },

  // Supply chain
  { pattern: /^package\.json$/, category: 'supply-chain', description: 'Package manifest' },
  { pattern: /^package-lock\.json$/, category: 'supply-chain', description: 'npm lockfile' },
  { pattern: /^\.npmrc$/, category: 'supply-chain', description: 'npm configuration' },
  { pattern: /^pnpm-lock\.yaml$/, category: 'supply-chain', description: 'pnpm lockfile' },
  { pattern: /^yarn\.lock$/, category: 'supply-chain', description: 'Yarn lockfile' },
  { pattern: /^bun\.lockb$/, category: 'supply-chain', description: 'Bun lockfile' },

  // Security configuration
  {
    pattern: /^\.gitleaks\.toml$/,
    category: 'security-config',
    description: 'Gitleaks configuration',
  },
  {
    pattern: /^\.github\/dependabot\.ya?ml$/,
    category: 'security-config',
    description: 'Dependabot configuration',
  },
  {
    pattern: /^\.github\/scorecard\.ya?ml$/,
    category: 'security-config',
    description: 'Scorecard configuration',
  },
  {
    pattern: /^codeql-config\.ya?ml$/,
    category: 'security-config',
    description: 'CodeQL configuration',
  },

  // Docker & containerization
  {
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded, anchored Dockerfile pattern
    pattern: /^Dockerfile(?:\.[\w.-]{1,32})?$/,
    category: 'containers',
    description: 'Dockerfile',
  },
  { pattern: /^docker\//, category: 'containers', description: 'Docker-related directory' },

  // Dependency automation
  { pattern: /^renovate\.json$/, category: 'automation', description: 'Renovate configuration' },
  {
    pattern: /^\.github\/renovate\.json$/,
    category: 'automation',
    description: 'Renovate configuration in .github',
  },

  // Executable scripts
  // Narrowed for specificity: restrict to conventional script dirs
  {
    pattern: /^(?:scripts|tools|bin)\/[^^\n]+\.(?:sh|ts)$/,
    category: 'scripts',
    description: 'Scripts (shell or TypeScript) in script/tool dirs',
  },
  { pattern: /^[^/\n]+\.sh$/, category: 'scripts', description: 'Top-level shell scripts' },
] as const;

/**
 * Backward-compatible export of patterns only.
 * External tooling may depend on this shape.
 */
export const HIGH_RISK_PATTERNS = HIGH_RISK_RULES.map((r) => r.pattern) as readonly RegExp[];

/**
 * ============================================
 * Medium-Risk Path Patterns
 * --------------------------------------------
 * Changes that affect enforcement, determinism,
 * or CI behaviour (but not trust roots).
 * ============================================
 */
const MEDIUM_RISK_RULES = [
  // Tooling and enforcement configuration
  { pattern: /^tsconfig\.json$/, category: 'enforcement', description: 'TypeScript configuration' },
  { pattern: /^biome\.json$/, category: 'enforcement', description: 'Biome configuration' },
  {
    pattern: /^eslint\.config\.(js|mjs|cjs)$/,
    category: 'enforcement',
    description: 'ESLint configuration',
  },
  { pattern: /^knip\.json$/, category: 'enforcement', description: 'Knip configuration' },
  { pattern: /^\.editorconfig$/, category: 'enforcement', description: 'Editor configuration' },

  // Non-workflow GitHub configuration
  {
    pattern: /^\.github\/(?!workflows\/).*\.(ya?ml)$/,
    category: 'enforcement',
    description: 'Other GitHub YAML configuration',
  },
] as const;

const MEDIUM_RISK_PATTERNS = MEDIUM_RISK_RULES.map((r) => r.pattern) as readonly RegExp[];

/**
 * ============================================
 * Risk Classification Internals
 * ============================================
 */
/**
 * Compare function for locale-aware alphabetical sorting
 */
function localeCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Builds a classification result with sorted reasons and paths.
 */
function buildClassificationResult(
  tier: RiskTier,
  highRiskPaths: Set<string>,
  mediumRiskPaths: Set<string>,
  reasons: Set<string>,
): RiskClassification {
  const outReasons = [...reasons].toSorted(localeCompare);

  let outPaths: readonly string[];
  if (tier === 'high') {
    outPaths = [...highRiskPaths].toSorted(localeCompare);
  } else if (tier === 'medium') {
    outPaths = [...mediumRiskPaths].toSorted(localeCompare);
  } else {
    outPaths = [];
  }

  return { tier, reasons: outReasons, paths: outPaths };
}

/**
 * ============================================
 * Risk Classification
 * ============================================
 */
/**
 * Classify a set of changed files into a risk tier with reasons and paths.
 *
 * @example
 * const files = ['.github/workflows/ci.yml', 'src/index.ts'] as const;
 * const result = classifyRisk(files);
 * // result.tier === 'high'
 * // result.paths includes '.github/workflows/ci.yml'
 */
export function classifyRisk(changedFiles: readonly string[]): RiskClassification {
  const highRiskPaths = new Set<string>();
  const mediumRiskPaths = new Set<string>();
  const reasons = new Set<string>();

  for (const file of changedFiles) {
    // High-risk takes absolute precedence
    if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(file))) {
      highRiskPaths.add(file);
      reasons.add(`High-risk change: ${file} affects trust or governance boundaries`);
      continue;
    }

    // Medium-risk only if not already high-risk
    if (MEDIUM_RISK_PATTERNS.some((pattern) => pattern.test(file))) {
      mediumRiskPaths.add(file);
      reasons.add(`Medium-risk change: ${file} affects enforcement configuration`);
    }
  }

  // Determine overall tier
  let tier: RiskTier;
  if (highRiskPaths.size > 0) {
    tier = 'high';
  } else if (mediumRiskPaths.size > 0) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  // Low-risk summary reason
  if (tier === 'low') {
    reasons.add('All changed files are low-risk (application code or documentation)');
  }

  return buildClassificationResult(tier, highRiskPaths, mediumRiskPaths, reasons);
}

/**
 * ============================================
 * Human-Readable Risk Description
 * ============================================
 */
export function getRiskDescription(tier: RiskTier): string {
  switch (tier) {
    case 'high':
      return 'High-risk: Changes affect trust boundaries, workflows, or supply chain';

    case 'medium':
      return 'Medium-risk: Changes affect enforcement configuration or determinism';

    case 'low':
      return 'Low-risk: Standard changes to application code or documentation';
  }
}

/**
 * ============================================
 * Governance Requirements by Risk Tier
 * ============================================
 */
export function getGovernanceRequirements(tier: RiskTier): readonly string[] {
  /**
   * @example
   * getGovernanceRequirements('high');
   * // ['PR required', 'No auto-merge', 'High-risk attestation required', ...]
   */
  switch (tier) {
    case 'high':
      return [
        'PR required',
        'No auto-merge',
        'High-risk attestation required',
        'Manual security review required',
        'Signed commits recommended',
      ];

    case 'medium':
      return ['PR required', 'Branch must be up-to-date', 'Standard checks must pass'];

    case 'low':
      return ['Standard checks must pass'];
  }
}

/**
 * Classify risk with optional pattern overrides for repository-specific tuning.
 * Defaults to built-in patterns, with ability to add more without replacing.
 *
 * @example
 * const result = classifyRiskWithConfig(['Dockerfile'], { highRisk: [/^k8s\//] });
 */
export function classifyRiskWithConfig(
  changedFiles: readonly string[],
  config?: { highRisk?: readonly RegExp[]; mediumRisk?: readonly RegExp[] },
): RiskClassification {
  const high = [...HIGH_RISK_PATTERNS, ...(config?.highRisk ?? [])];
  const medium = [...MEDIUM_RISK_PATTERNS, ...(config?.mediumRisk ?? [])];

  const highRiskPaths = new Set<string>();
  const mediumRiskPaths = new Set<string>();
  const reasons = new Set<string>();

  for (const file of changedFiles) {
    if (high.some((p) => p.test(file))) {
      highRiskPaths.add(file);
      reasons.add(`High-risk change: ${file} affects trust or governance boundaries`);
      continue;
    }
    if (medium.some((p) => p.test(file))) {
      mediumRiskPaths.add(file);
      reasons.add(`Medium-risk change: ${file} affects enforcement configuration`);
    }
  }

  let tier: RiskTier;
  if (highRiskPaths.size > 0) {
    tier = 'high';
  } else if (mediumRiskPaths.size > 0) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  if (tier === 'low') {
    reasons.add('All changed files are low-risk (application code or documentation)');
  }

  return buildClassificationResult(tier, highRiskPaths, mediumRiskPaths, reasons);
}
