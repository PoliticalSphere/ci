# Policy Engine

Deterministic policy-as-code for classifying risk, validating PR attestations, and making allow/warn/deny decisions. Designed to be pure, auditable, and conservative by default.

## Public API

All policy APIs are re-exported from `src/policy/index.ts` and also surfaced via the package root `src/index.ts`.

- Core: `evaluatePolicy`, `makeDecision`, `serializeToJSON`, `generateMarkdownSummary`
- Classification: `classifyRisk`, `classifyRiskWithConfig`, `getRiskDescription`, `getGovernanceRequirements`, `HIGH_RISK_RULES`, `HIGH_RISK_PATTERNS`
- Attestations: `parseAIAttestation`, `validateAttestation`, `parseHighRiskAttestation`, `validateHighRiskAttestation`, `findAIAttestationNearMatches`, `findHighRiskAttestationNearMatches`, `validateCheckboxFormat`, `AI_ATTESTATION_LABELS`, `HIGH_RISK_ATTESTATION_LABELS`, `CHECKED_CHECKBOX_RE`
- Violation codes: `VIOLATION_AI_ATTESTATION_MISSING`, `VIOLATION_HIGH_RISK_GOVERNANCE_MISSING`, `VIOLATION_HIGH_RISK_AI_CHANGE`, `VIOLATION_AI_ATTESTATION_NEAR_MATCH`, `VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH`, `VIOLATION_CHECKBOX_FORMAT_ISSUE`
- Types: `EvaluatePolicyInput`, `EvaluatePolicyOptions`, `EvaluatePolicyOutput`, `PolicyResult`, `PolicyDecision`, `PolicyViolation`, `DecisionTrailEntry`, `RiskClassification`, `RiskTier`, `HighRiskRule`, `AIAttestation`, `AttestationValidation`

## Modules

- risk-classification.ts: Declarative file-pattern classification into `low | medium | high` with human-readable reasons and elevated paths.
- attestation.ts: Parsing and validation of AI-assisted and high-risk governance attestations from PR bodies.
- decision.ts: Aggregates classification + validations; emits structured results, violation codes, and Markdown summaries. Includes `evaluatePolicy()` orchestration.

## Quick Start

```ts
import { evaluatePolicy, generateMarkdownSummary } from './decision.ts';

const changedFiles = ['src/app.ts'];
const prBody = `
- [x] **This PR contains AI-assisted changes**
- [x] I have reviewed all AI-generated code
- [x] I have verified that no secrets
- [x] The changes align with
- [x] I have tested the changes locally
`;

const out = evaluatePolicy({ prBody, changedFiles });

console.log(out.result.decision); // 'allow' | 'warn' | 'deny'
console.log(generateMarkdownSummary(out.result, out.classification.reasons, out.classification.paths));
```

## Risk Classification

- High-risk patterns include trust boundaries, supply-chain, security, and execution:
  - `.github/workflows/`, `.github/actions/`
  - `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `.npmrc`
  - `.gitleaks.toml`, `.github/dependabot.yml/.yaml`, `.github/scorecard.yml/.yaml`, `codeql-config.yml/.yaml`
  - `Dockerfile*`, `docker/`, `renovate.json`, `.github/renovate.json`
  - `scripts/**/*.{sh,ts}`, `tools/**/*.{sh,ts}`, `bin/**/*.{sh,ts}`, `./*.{sh,ts}`
- Medium-risk patterns include enforcement configs and non-workflow GitHub configs.

APIs:

- `classifyRisk(files)` → `{ tier, reasons, paths }` (reasons/paths sorted)
- `classifyRiskWithConfig(files, { highRisk?, mediumRisk? })` → same, with additive pattern overrides
- `HIGH_RISK_RULES` exported (pattern + category + description) for richer tooling
- `HIGH_RISK_PATTERNS` preserved for backward-compatible pattern reuse

## Attestations

- AI: Enforced only when the declaration checkbox is checked.
- High-risk: Required when elevated-risk paths are present; missing declaration is a denial.
- Parsers accept both `-` and `*` bullets and tolerate whitespace.

APIs:

- `parseAIAttestation(prBody)` → `{ declared, reviewed, noSecrets, alignsWithStandards, locallyTested }`
- `validateAttestation(att, riskTier)` → `{ valid, missing[], warnings[] }`
- `findAIAttestationNearMatches(prBody, maxDistance?)` → string[] keys for likely typos
- `parseHighRiskAttestation(prBody)` → `{ declared, understood, securityReviewed, noPrivilegeEscalation, documented, rollbackPlan, monitoringCommitment }`

- `validateHighRiskAttestation(att, hasHighRiskPaths)` → `{ valid, missing[], warnings[] }`
- `findHighRiskAttestationNearMatches(prBody, maxDistance?)` → string[] keys for likely typos
- `validateCheckboxFormat(prBody)` → `{ issues[] }` for non-standard checkbox formats

## Decisions

- Precedence: `allow < warn < deny`.
- Violations include stable codes and categories.

APIs:

- `makeDecision(riskTier, riskPaths, aiValid, aiMissing[], highRiskValid, highRiskMissing[], aiAssisted, changedFiles, timestamp)` → `PolicyResult`
- `serializeToJSON(result)`
- `generateMarkdownSummary(result, reasons, paths)`
- `evaluatePolicy({ prBody, changedFiles, timestamp?, options? })` → `{ result, classification, ai, highRisk }`
  - `options.enableNearMatchWarnings` (default: true) — add non-blocking warnings for likely typos
  - `options.nearMatchMaxDistance` (default: 3) — tweak typo sensitivity
  - `options.enableCheckboxFormatWarnings` (default: true) — warn on non-standard checkbox formats

Codes (exported constants):

- `VIOLATION_AI_ATTESTATION_MISSING`
- `VIOLATION_HIGH_RISK_GOVERNANCE_MISSING`
- `VIOLATION_HIGH_RISK_AI_CHANGE`
- `VIOLATION_AI_ATTESTATION_NEAR_MATCH`
- `VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH`
- `VIOLATION_CHECKBOX_FORMAT_ISSUE`

## Design Principles

- Pure functions, no I/O side effects
- Declarative policy data; auditable reasons
- Conservative defaults (fail-closed)

## Notes

- Output reasons and paths are sorted for deterministic summaries.
- Timestamps are caller-supplied for deterministic policy results; `evaluatePolicy` accepts an optional `timestamp` and defaults to the current time.
- Consider repository-specific tuning via `classifyRiskWithConfig`.
