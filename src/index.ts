/**
 * PoliticalSphere CI - Main Entry Point
 *
 * This package provides shared CI infrastructure, linting configuration,
 * and policy enforcement for the PoliticalSphere organization.
 */

export const VERSION = '0.0.1' as const;

export { DEFAULT_EXECUTION_LOCK_PATH } from './cli/execution/execution-lock.js';
export type {
  LinterMetrics,
  TelemetryStats,
} from './cli/observability/telemetry.js';
export {
  getGlobalTelemetry,
  resetGlobalTelemetry,
  TelemetryCollector,
} from './cli/observability/telemetry.js';

// Re-export observability components
export type { TraceContext } from './cli/observability/tracing.js';
export {
  createChildTraceContext,
  createTraceContext,
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
  traceContextToJSON,
} from './cli/observability/tracing.js';
// Re-export all policy engine components
export type {
  AIAttestation,
  AttestationValidation,
  DecisionTrailEntry,
  EvaluatePolicyInput,
  EvaluatePolicyOptions,
  EvaluatePolicyOutput,
  HighRiskRule,
  PolicyDecision,
  PolicyResult,
  PolicyViolation,
  RiskClassification,
  RiskTier,
} from './policy/index.js';
export {
  AI_ATTESTATION_LABELS,
  CHECKED_CHECKBOX_RE,
  classifyRisk,
  classifyRiskWithConfig,
  evaluatePolicy,
  findAIAttestationNearMatches,
  findHighRiskAttestationNearMatches,
  generateMarkdownSummary,
  getGovernanceRequirements,
  getRiskDescription,
  HIGH_RISK_ATTESTATION_LABELS,
  HIGH_RISK_PATTERNS,
  HIGH_RISK_RULES,
  makeDecision,
  parseAIAttestation,
  parseHighRiskAttestation,
  serializeToJSON,
  VIOLATION_AI_ATTESTATION_MISSING,
  VIOLATION_AI_ATTESTATION_NEAR_MATCH,
  VIOLATION_CHECKBOX_FORMAT_ISSUE,
  VIOLATION_HIGH_RISK_AI_CHANGE,
  VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH,
  VIOLATION_HIGH_RISK_GOVERNANCE_MISSING,
  validateAttestation,
  validateCheckboxFormat,
  validateHighRiskAttestation,
} from './policy/index.js';

export type CIConfig = {
  readonly version: string;
  readonly tiers: readonly string[];
};

export const config: CIConfig = {
  version: VERSION,
  tiers: ['biome', 'eslint', 'typescript', 'knip', 'orthogonal', 'policy'],
} as const;
