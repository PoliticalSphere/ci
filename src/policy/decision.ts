/**
 * Policy Engine — Decision Model
 *
 * Pure, deterministic aggregation of:
 * - risk classification
 * - AI attestation validation
 * - governance requirements
 *
 * This layer:
 * - makes authoritative allow / warn / deny decisions
 * - emits structured, machine-readable output
 * - produces human-readable summaries without encoding policy logic
 */

import {
  AI_ATTESTATION_LABELS,
  findAIAttestationNearMatches,
  findHighRiskAttestationNearMatches,
  HIGH_RISK_ATTESTATION_LABELS,
  parseAIAttestation,
  parseHighRiskAttestation,
  validateAttestation,
  validateCheckboxFormat,
  validateHighRiskAttestation,
} from './attestation.ts';
import { classifyRisk, getGovernanceRequirements, type RiskTier } from './risk-classification.ts';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PolicyDecision = 'allow' | 'warn' | 'deny';

type ViolationSeverity = 'error' | 'warning';
type ViolationCategory = 'risk' | 'attestation' | 'governance';

const DECISION_TRAIL_NO_RULES = 'NO_RULES_TRIGGERED' as const;

export interface PolicyViolation {
  readonly code: string; // stable identifier
  readonly severity: ViolationSeverity;
  readonly category: ViolationCategory;
  readonly message: string;
  readonly remediation?: string;
}

export interface DecisionTrailEntry {
  readonly rule: string;
  readonly before: PolicyDecision;
  readonly after: PolicyDecision;
  readonly detail: string;
}

export interface PolicyResult {
  readonly decision: PolicyDecision;
  readonly riskTier: RiskTier;
  readonly violations: readonly PolicyViolation[];
  readonly decisionTrail: readonly DecisionTrailEntry[];
  readonly metadata: {
    readonly timestamp: string;
    readonly changedFilesCount: number;
    readonly highRiskPathsCount: number;
    readonly aiAssisted: boolean;
    readonly rationale: readonly string[];
  };
}

/* -------------------------------------------------------------------------- */
/* Public violation codes                                                     */
/* -------------------------------------------------------------------------- */

export const VIOLATION_AI_ATTESTATION_MISSING = 'AI_ATTESTATION_MISSING' as const;
export const VIOLATION_HIGH_RISK_GOVERNANCE_MISSING = 'HIGH_RISK_GOVERNANCE_MISSING' as const;
export const VIOLATION_HIGH_RISK_AI_CHANGE = 'HIGH_RISK_AI_CHANGE' as const;
export const VIOLATION_AI_ATTESTATION_NEAR_MATCH = 'AI_ATTESTATION_NEAR_MATCH' as const;
export const VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH =
  'HIGH_RISK_ATTESTATION_NEAR_MATCH' as const;
export const VIOLATION_CHECKBOX_FORMAT_ISSUE = 'CHECKBOX_FORMAT_ISSUE' as const;
export const VIOLATION_CI_CHECK_FAILURE = 'CI_CHECK_FAILURE' as const;

/* -------------------------------------------------------------------------- */
/* Decision precedence                                                        */
/* -------------------------------------------------------------------------- */

const DECISION_PRECEDENCE: readonly PolicyDecision[] = ['allow', 'warn', 'deny'];

function escalateDecision(current: PolicyDecision, next: PolicyDecision): PolicyDecision {
  return DECISION_PRECEDENCE.indexOf(next) > DECISION_PRECEDENCE.indexOf(current) ? next : current;
}

function buildMissingSummary(prefix: string, missing: readonly string[], fallback: string): string {
  return missing.length > 0 ? `${prefix}: ${missing.join(', ')}` : fallback;
}

function appendMissingViolations(
  violations: PolicyViolation[],
  missing: readonly string[],
  code: string,
  category: ViolationCategory,
  messagePrefix: string,
  remediation: string,
): void {
  for (const item of missing) {
    violations.push({
      code,
      severity: 'error',
      category,
      message: `${messagePrefix}: ${item}`,
      remediation,
    });
  }
}

function collectAttestationNearMatchViolations(params: {
  readonly enabled: boolean;
  readonly shouldCheck: boolean;
  readonly prBody: string;
  readonly nearMatchMax: number | undefined;
  readonly rule: string;
  readonly labels: Record<string, string>;
  readonly baseDecision: PolicyDecision;
  readonly detailPrefix: string;
  readonly messagePrefix: string;
  readonly remediation: string;
}): { violations: PolicyViolation[]; trail: DecisionTrailEntry[] } {
  if (!params.enabled || !params.shouldCheck) {
    return { violations: [], trail: [] };
  }

  const nearMatches =
    params.rule === VIOLATION_AI_ATTESTATION_NEAR_MATCH
      ? findAIAttestationNearMatches(params.prBody, params.nearMatchMax)
      : findHighRiskAttestationNearMatches(params.prBody, params.nearMatchMax);

  const trail: DecisionTrailEntry[] =
    nearMatches.length > 0
      ? [
          {
            rule: params.rule,
            before: params.baseDecision,
            after: params.baseDecision,
            detail: `${params.detailPrefix} (${nearMatches.length})`,
          },
        ]
      : [];

  const violations: PolicyViolation[] = nearMatches.map((key) => {
    // eslint-disable-next-line security/detect-object-injection -- Safe: key comes from findAIAttestationNearMatches/findHighRiskAttestationNearMatches which return known keys
    const expected = params.labels[key] as string;
    return {
      code: params.rule,
      severity: 'warning',
      category: 'attestation',
      message: `Possible typo near ${params.messagePrefix}: expected checked line starting with "${expected}"`,
      remediation: params.remediation,
    };
  });

  return { violations, trail };
}

function collectCheckboxFormatViolations(
  enabled: boolean,
  prBody: string,
  baseDecision: PolicyDecision,
): { violations: PolicyViolation[]; trail: DecisionTrailEntry[] } {
  if (!enabled) {
    return { violations: [], trail: [] };
  }

  const { issues } = validateCheckboxFormat(prBody);
  const trail: DecisionTrailEntry[] =
    issues.length > 0
      ? [
          {
            rule: VIOLATION_CHECKBOX_FORMAT_ISSUE,
            before: baseDecision,
            after: baseDecision,
            detail: `Non-standard checkbox formats detected (${issues.length})`,
          },
        ]
      : [];
  const violations: PolicyViolation[] = issues.map((msg) => ({
    code: VIOLATION_CHECKBOX_FORMAT_ISSUE,
    severity: 'warning',
    category: 'attestation',
    message: msg,
    remediation: 'Use standard "- [x]" checkbox formatting for attestations.',
  }));

  return { violations, trail };
}

/* -------------------------------------------------------------------------- */
/* Core decision function                                                     */
/* -------------------------------------------------------------------------- */

export function makeDecision(
  riskTier: RiskTier,
  riskPaths: readonly string[],
  attestationValid: boolean,
  attestationMissing: readonly string[],
  highRiskAttestationValid: boolean,
  highRiskAttestationMissing: readonly string[],
  aiAssisted: boolean,
  changedFiles: readonly string[],
  timestamp: string,
  failedCIChecks: readonly string[] = [],
): PolicyResult {
  const violations: PolicyViolation[] = [];
  const rationale: string[] = [];
  const decisionTrail: DecisionTrailEntry[] = [];

  let decision: PolicyDecision = 'allow';

  const recordDecisionStep = (rule: string, detail: string, next: PolicyDecision): void => {
    const before = decision;
    decision = escalateDecision(decision, next);
    decisionTrail.push({ rule, before, after: decision, detail });
  };

  // CI check failures (highest priority)
  if (failedCIChecks.length > 0) {
    for (const checkName of failedCIChecks) {
      violations.push({
        code: VIOLATION_CI_CHECK_FAILURE,
        severity: 'error',
        category: 'governance',
        message: `Required CI check failed: ${checkName}`,
        remediation: `Fix the issues reported by ${checkName} and ensure all checks pass.`,
      });
    }
    rationale.push(`CI checks failed: ${failedCIChecks.join(', ')}`);
    recordDecisionStep(
      VIOLATION_CI_CHECK_FAILURE,
      `Required CI checks failed (${failedCIChecks.length}): ${failedCIChecks.join(', ')}`,
      'deny',
    );
  }

  // AI attestation requirements
  if (aiAssisted && !attestationValid) {
    const missingSummary = buildMissingSummary(
      'AI-assisted change missing attestations',
      attestationMissing,
      'AI-assisted change missing required attestations',
    );
    appendMissingViolations(
      violations,
      attestationMissing,
      VIOLATION_AI_ATTESTATION_MISSING,
      'attestation',
      'Missing AI attestation',
      'Add the missing AI attestation checkbox(es) to the PR description.',
    );
    rationale.push('AI-assisted change without required attestations');
    recordDecisionStep(VIOLATION_AI_ATTESTATION_MISSING, missingSummary, 'deny');
  }

  // High-risk governance attestations
  if (riskTier === 'high' && !highRiskAttestationValid) {
    const missingSummary = buildMissingSummary(
      'High-risk change missing governance attestations',
      highRiskAttestationMissing,
      'High-risk change missing mandatory governance attestations',
    );
    appendMissingViolations(
      violations,
      highRiskAttestationMissing,
      VIOLATION_HIGH_RISK_GOVERNANCE_MISSING,
      'governance',
      'Missing high-risk governance attestation',
      'Add the required high-risk governance attestations to the PR description.',
    );
    rationale.push('High-risk change missing mandatory governance attestations');
    recordDecisionStep(VIOLATION_HIGH_RISK_GOVERNANCE_MISSING, missingSummary, 'deny');
  }

  // Risk-based warning (non-blocking)
  if (riskTier === 'high' && aiAssisted) {
    violations.push({
      code: VIOLATION_HIGH_RISK_AI_CHANGE,
      severity: 'warning',
      category: 'risk',
      message:
        'High-risk paths modified with AI assistance require additional scrutiny and manual review',
      remediation:
        'Perform a manual review and security check before merging high-risk AI changes.',
    });
    rationale.push('High-risk paths modified with AI assistance');
    recordDecisionStep(
      VIOLATION_HIGH_RISK_AI_CHANGE,
      'High-risk paths modified with AI assistance',
      'warn',
    );
  }

  if (decisionTrail.length === 0 && decision === 'allow') {
    decisionTrail.push({
      rule: DECISION_TRAIL_NO_RULES,
      before: decision,
      after: decision,
      detail: 'No policy violations detected',
    });
  }

  return {
    decision,
    riskTier,
    violations,
    decisionTrail,
    metadata: {
      timestamp,
      changedFilesCount: changedFiles.length,
      highRiskPathsCount: riskPaths.length,
      aiAssisted,
      rationale,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Serialization helpers                                                      */
/* -------------------------------------------------------------------------- */

export function serializeToJSON(result: PolicyResult): string {
  return JSON.stringify(result, null, 2);
}

export function generateMarkdownSummary(
  result: PolicyResult,
  riskReasons: readonly string[],
  riskPaths: readonly string[],
): string {
  const { decision, riskTier, violations, metadata, decisionTrail } = result;

  const lines: string[] = ['# Policy Evaluation Summary\n'];

  // eslint-disable-next-line unicorn/no-nested-ternary -- Biome formatter conflict
  const emoji = decision === 'allow' ? '✅' : decision === 'warn' ? '⚠️' : '❌';
  lines.push(
    `**Decision**: ${emoji} ${decision.toUpperCase()}\n`,
    '## Risk Assessment\n',
    `**Risk Tier**: ${riskTier.toUpperCase()}`,
    `**Changed Files**: ${metadata.changedFilesCount}`,
    `**High-Risk Paths**: ${metadata.highRiskPathsCount}`,
    `**AI-Assisted**: ${metadata.aiAssisted ? 'Yes' : 'No'}\n`,
  );

  const pushRiskReasons = (reasons: readonly string[]) => {
    const sortedReasons = [...reasons].toSorted();
    if (sortedReasons.length > 0) {
      lines.push('### Risk Classification Reasons\n', ...sortedReasons.map((r) => `- ${r}`), '');
    }
  };

  const pushSortedPaths = (paths: readonly string[]) => {
    const sorted = [...paths].toSorted();
    if (sorted.length > 0) {
      lines.push('### Elevated-Risk Paths\n', ...sorted.map((p) => `- \`${p}\``), '');
    }
  };

  const pushViolations = (
    vs: readonly {
      code: string;
      category: string;
      message: string;
      severity: 'error' | 'warning';
    }[],
  ) => {
    if (vs.length > 0) {
      lines.push(
        '## Violations\n',
        ...vs.map(
          (v) =>
            `${v.severity === 'error' ? '❌' : '⚠️'} **${v.code}** (${v.category}): ${v.message}`,
        ),
        '',
      );
    }
  };

  const pushDecisionTrail = (
    dt: readonly { rule: string; before: string; after: string; detail: string }[],
  ) => {
    if (dt.length > 0) {
      lines.push(
        '## Decision Explanation\n',
        ...dt.map((step) => {
          const change =
            step.before === step.after
              ? `${step.after.toUpperCase()} (no change)`
              : `${step.before.toUpperCase()} -> ${step.after.toUpperCase()}`;
          return `- ${step.rule}: ${step.detail} (${change})`;
        }),
        '',
      );
    }
  };

  pushRiskReasons(riskReasons);
  pushSortedPaths(riskPaths);
  pushViolations(violations);
  pushDecisionTrail(decisionTrail);

  const remediationSuggestions = [
    ...new Set(violations.map((v) => v.remediation).filter(Boolean) as string[]),
  ];
  if (remediationSuggestions.length > 0) {
    lines.push('## Remediation Suggestions\n');
    for (const suggestion of remediationSuggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');
  }

  if (riskTier !== 'low') {
    lines.push('## Governance Requirements\n');
    for (const r of getGovernanceRequirements(riskTier)) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  lines.push('---', `*Generated at ${metadata.timestamp}*`);

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Orchestration helper                                                       */
/* -------------------------------------------------------------------------- */

export interface EvaluatePolicyInput {
  readonly prBody: string;
  readonly changedFiles: readonly string[];
  readonly timestamp?: string;
  readonly options?: EvaluatePolicyOptions;
  readonly failedCIChecks?: readonly string[];
}

export interface EvaluatePolicyOptions {
  /** When true, add non-blocking warnings for likely typos in attestation checkboxes. */
  readonly enableNearMatchWarnings?: boolean;
  /** Optional max distance for near-match detection (default 3). */
  readonly nearMatchMaxDistance?: number;
  /** When true, add warnings for non-standard checkbox formats. */
  readonly enableCheckboxFormatWarnings?: boolean;
}

export interface EvaluatePolicyOutput {
  readonly result: PolicyResult;
  readonly classification: ReturnType<typeof classifyRisk>;
  readonly ai: {
    readonly attestation: ReturnType<typeof parseAIAttestation>;
    readonly validation: ReturnType<typeof validateAttestation>;
  };
  readonly highRisk: {
    readonly attestation: ReturnType<typeof parseHighRiskAttestation>;
    readonly validation: ReturnType<typeof validateHighRiskAttestation>;
  };
}

/**
 * Evaluate policy end-to-end from PR body and changed files.
 *
 * Bundles risk classification, attestation parsing/validation, and decision
 * into a single call for consumers to avoid boilerplate wiring.
 *
 * @example
 * const out = evaluatePolicy({ prBody, changedFiles });
 * if (out.result.decision === 'deny') {
 *   // handle violations
 * }
 */
export function evaluatePolicy(input: EvaluatePolicyInput): EvaluatePolicyOutput {
  const { prBody, changedFiles } = input;
  const timestamp = input.timestamp ?? new Date().toISOString();
  const opts: EvaluatePolicyOptions = input.options ?? {};
  const enableNearMatch = opts.enableNearMatchWarnings ?? true;
  const enableFormat = opts.enableCheckboxFormatWarnings ?? true;
  const nearMatchMax = opts.nearMatchMaxDistance;
  const failedCIChecks = input.failedCIChecks ?? [];

  const classification = classifyRisk(changedFiles);

  const aiAttestation = parseAIAttestation(prBody);
  const aiValidation = validateAttestation(aiAttestation, classification.tier);

  const highRiskAttestation = parseHighRiskAttestation(prBody);
  const hasHighRiskPaths = classification.tier === 'high' && classification.paths.length > 0;
  const highRiskValidation = validateHighRiskAttestation(highRiskAttestation, hasHighRiskPaths);

  const baseResult = makeDecision(
    classification.tier,
    classification.paths,
    aiValidation.valid,
    aiValidation.missing,
    highRiskValidation.valid,
    highRiskValidation.missing,
    aiAttestation.declared,
    changedFiles,
    timestamp,
    failedCIChecks,
  );

  // Append non-blocking warnings for near-matches and checkbox format issues
  const extraViolations: PolicyViolation[] = [];
  const extraDecisionTrail: DecisionTrailEntry[] = [];
  const baseDecision = baseResult.decision;

  const aiNear = collectAttestationNearMatchViolations({
    enabled: enableNearMatch,
    shouldCheck: aiAttestation.declared,
    prBody,
    nearMatchMax,
    rule: VIOLATION_AI_ATTESTATION_NEAR_MATCH,
    labels: AI_ATTESTATION_LABELS,
    baseDecision,
    detailPrefix: 'Possible AI attestation typos detected',
    messagePrefix: 'AI attestation',
    remediation: 'Fix the AI attestation checkbox text to match the expected label.',
  });
  extraViolations.push(...aiNear.violations);
  extraDecisionTrail.push(...aiNear.trail);

  const highRiskNear = collectAttestationNearMatchViolations({
    enabled: enableNearMatch,
    shouldCheck: hasHighRiskPaths,
    prBody,
    nearMatchMax,
    rule: VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH,
    labels: HIGH_RISK_ATTESTATION_LABELS,
    baseDecision,
    detailPrefix: 'Possible high-risk attestation typos detected',
    messagePrefix: 'high-risk attestation',
    remediation: 'Fix the high-risk attestation checkbox text to match the expected label.',
  });
  extraViolations.push(...highRiskNear.violations);
  extraDecisionTrail.push(...highRiskNear.trail);

  const formatViolations = collectCheckboxFormatViolations(enableFormat, prBody, baseDecision);
  extraViolations.push(...formatViolations.violations);
  extraDecisionTrail.push(...formatViolations.trail);

  const result: PolicyResult = {
    ...baseResult,
    violations: [...baseResult.violations, ...extraViolations],
    decisionTrail:
      extraDecisionTrail.length === 0
        ? baseResult.decisionTrail
        : [
            ...baseResult.decisionTrail.filter((entry) => entry.rule !== DECISION_TRAIL_NO_RULES),
            ...extraDecisionTrail,
          ],
  };

  return {
    result,
    classification,
    ai: { attestation: aiAttestation, validation: aiValidation },
    highRisk: { attestation: highRiskAttestation, validation: highRiskValidation },
  };
}
