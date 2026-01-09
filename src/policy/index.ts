/**
 * Policy Engine — Public API Surface
 *
 * Deterministic policy-as-code for CI:
 * - Risk classification of changed files
 * - AI and high-risk governance attestation parsing/validation
 * - Authoritative allow/warn/deny decisions with stable violation codes
 * - Human-readable Markdown summaries and JSON serialization helpers
 *
 * Quick start
 * ```ts
 * import {
 *   evaluatePolicy,
 *   generateMarkdownSummary,
 * } from '@politicalsphere/ci/policy';
 *
 * const changedFiles = ['src/app.ts'] as const;
 * const prBody = `\n- [x] **This PR contains AI-assisted changes**\n- [x] I have reviewed all AI-generated code\n- [x] I have verified that no secrets\n- [x] The changes align with\n- [x] I have tested the changes locally\n+ `;
 *
 * const out = evaluatePolicy({ prBody, changedFiles });
 * const summary = generateMarkdownSummary(
 *   out.result,
 *   out.classification.reasons,
 *   out.classification.paths,
 * );
 * ```
 */

export {
  AI_ATTESTATION_LABELS,
  type AIAttestation,
  type AttestationValidation,
  CHECKED_CHECKBOX_RE,
  findAIAttestationNearMatches,
  findHighRiskAttestationNearMatches,
  HIGH_RISK_ATTESTATION_LABELS,
  parseAIAttestation,
  parseHighRiskAttestation,
  validateAttestation,
  validateCheckboxFormat,
  validateHighRiskAttestation,
} from './attestation.js';

export {
  type DecisionTrailEntry,
  type EvaluatePolicyInput,
  type EvaluatePolicyOptions,
  type EvaluatePolicyOutput,
  evaluatePolicy,
  generateMarkdownSummary,
  makeDecision,
  type PolicyDecision,
  type PolicyResult,
  type PolicyViolation,
  serializeToJSON,
  VIOLATION_AI_ATTESTATION_MISSING,
  VIOLATION_AI_ATTESTATION_NEAR_MATCH,
  VIOLATION_CHECKBOX_FORMAT_ISSUE,
  VIOLATION_CI_CHECK_FAILURE,
  VIOLATION_HIGH_RISK_AI_CHANGE,
  VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH,
  VIOLATION_HIGH_RISK_GOVERNANCE_MISSING,
} from './decision.js';

export {
  classifyRisk,
  classifyRiskWithConfig,
  getGovernanceRequirements,
  getRiskDescription,
  HIGH_RISK_PATTERNS,
  HIGH_RISK_RULES,
  type HighRiskRule,
  type RiskClassification,
  type RiskTier,
} from './risk-classification.js';
