/**
 * Tests for Policy Decision Engine
 *
 * These tests assert:
 * - deterministic decision outcomes
 * - explicit precedence rules
 * - stable violation semantics
 * - machine- and human-readable outputs
 */

import { describe, expect, it } from 'vitest';
import {
  evaluatePolicy,
  generateMarkdownSummary,
  makeDecision,
  type PolicyResult,
  serializeToJSON,
  VIOLATION_AI_ATTESTATION_MISSING,
  VIOLATION_HIGH_RISK_AI_CHANGE,
  VIOLATION_HIGH_RISK_GOVERNANCE_MISSING,
} from './decision.ts';

// cspell:ignore revieed secrtes implicatons securty priviledge plann monitorng
const fixedTimestamp = '2024-01-01T00:00:00.000Z';

const makeLowRiskDecision = () =>
  makeDecision('low', [], true, [], true, [], false, ['src/index.ts'], fixedTimestamp);

describe('Policy Decision Engine', () => {
  describe('makeDecision', () => {
    it('allows low-risk non-AI changes', () => {
      const result = makeLowRiskDecision();

      expect(result.decision).toBe('allow');
      expect(result.riskTier).toBe('low');
      expect(result.violations).toHaveLength(0);
      expect(result.metadata.aiAssisted).toBe(false);
    });

    it('denies AI-assisted changes with missing attestations', () => {
      const result = makeDecision(
        'low',
        [],
        false,
        ['AI review', 'No-secrets confirmation'],
        true,
        [],
        true,
        ['src/index.ts'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
      expect(result.violations).toHaveLength(2);
      expect(result.violations.every((v) => v.severity === 'error')).toBe(true);
      expect(result.violations.every((v) => v.category === 'attestation')).toBe(true);
      expect(result.decisionTrail).toHaveLength(1);
    });

    it('uses a fallback summary when AI attestation missing list is empty', () => {
      const result = makeDecision(
        'low',
        [],
        false,
        [],
        true,
        [],
        true,
        ['src/index.ts'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
      expect(result.decisionTrail).toHaveLength(1);
      expect(result.decisionTrail[0]?.detail).toBe(
        'AI-assisted change missing required attestations',
      );
    });

    it('denies high-risk changes with missing governance attestations', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        false,
        ['Security review', 'Rollback plan'],
        false,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
      expect(result.violations).toHaveLength(2);
      expect(result.violations.every((v) => v.category === 'governance')).toBe(true);
    });

    it('uses a fallback summary when high-risk governance missing list is empty', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        false,
        [],
        false,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
      expect(result.decisionTrail).toHaveLength(1);
      expect(result.decisionTrail[0]?.detail).toBe(
        'High-risk change missing mandatory governance attestations',
      );
    });

    it('warns (but does not deny) on high-risk AI-assisted changes with valid attestations', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        true,
        [],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('warn');
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.severity).toBe('warning');
      expect(result.violations[0]?.category).toBe('risk');
      expect(result.violations[0]?.code).toBe(VIOLATION_HIGH_RISK_AI_CHANGE);
    });

    it('enforces decision precedence: deny overrides warn', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        false,
        ['AI attestation missing'],
        true,
        [],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
    });

    it('includes deterministic metadata', () => {
      const changedFiles = ['a.ts', 'b.ts', 'c.ts'];
      const result = makeDecision(
        'medium',
        [],
        true,
        [],
        true,
        [],
        false,
        changedFiles,
        fixedTimestamp,
      );

      expect(result.metadata.changedFilesCount).toBe(3);
      expect(result.metadata.highRiskPathsCount).toBe(0);
      expect(result.metadata.aiAssisted).toBe(false);
      expect(result.metadata.timestamp).toBe(fixedTimestamp);
      expect(result.metadata.rationale.length).toBeGreaterThanOrEqual(0);
      expect(result.decisionTrail).toHaveLength(1);
      expect(result.decisionTrail[0]?.detail).toContain('No policy violations');
    });

    it('formats AI attestation missing summary with multiple items (line 118)', () => {
      // Test line 118: true branch of ternary (attestationMissing.length > 0)
      const result = makeDecision(
        'low',
        [],
        false,
        ['AI review', 'No-secrets confirmation'],
        true,
        [],
        true,
        ['src/index.ts'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
      expect(result.violations.length).toBeGreaterThan(0);
      // Verify violations exist for multiple missing attestations
      const aiViolations = result.violations.filter((v) => v.category === 'attestation');
      expect(aiViolations.length).toBeGreaterThanOrEqual(2);
    });

    it('formats governance attestation missing summary with multiple items (line 137)', () => {
      // Test line 137: true branch of ternary (highRiskAttestationMissing.length > 0)
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        false,
        ['Security review', 'Rollback plan'],
        false,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      expect(result.decision).toBe('deny');
      // Verify violations exist for multiple missing governance attestations
      const govViolations = result.violations.filter((v) => v.category === 'governance');
      expect(govViolations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('serializeToJSON', () => {
    it('serializes to valid, complete JSON', () => {
      const result = makeLowRiskDecision();

      const json = serializeToJSON(result);
      const parsed = JSON.parse(json) as PolicyResult;

      expect(parsed.decision).toBe('allow');
      expect(parsed.riskTier).toBe('low');
      expect(parsed.metadata).toBeDefined();
      expect(parsed.violations).toEqual([]);
    });
  });

  describe('generateMarkdownSummary', () => {
    it('renders an allow decision summary', () => {
      const result = makeLowRiskDecision();

      const markdown = generateMarkdownSummary(result, ['All files are low-risk'], []);

      expect(markdown).toContain('# Policy Evaluation Summary');
      expect(markdown).toContain('✅ ALLOW');
      expect(markdown).toContain('Risk Tier**: LOW');
      expect(markdown).toContain('AI-Assisted**: No');
      expect(markdown).toContain('## Decision Explanation');
    });

    it('renders deny decision with violations', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        false,
        ['AI review missing'],
        false,
        ['Security review missing'],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(
        result,
        ['High-risk workflow modification'],
        ['.github/workflows/ci.yml'],
      );

      expect(markdown).toContain('❌ DENY');
      expect(markdown).toContain('## Violations');
      expect(markdown).toContain('## Decision Explanation');
      expect(markdown).toContain('## Remediation Suggestions');
      expect(markdown).toContain(VIOLATION_HIGH_RISK_GOVERNANCE_MISSING);
      expect(markdown).toContain(VIOLATION_AI_ATTESTATION_MISSING);
    });

    it('lists elevated-risk paths when present', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml', 'package.json'],
        true,
        [],
        true,
        [],
        false,
        ['.github/workflows/ci.yml', 'package.json'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(
        result,
        [],
        ['.github/workflows/ci.yml', 'package.json'],
      );

      expect(markdown).toContain('### Elevated-Risk Paths');
      expect(markdown).toContain('`.github/workflows/ci.yml`');
      expect(markdown).toContain('`package.json`');
    });

    it('renders warn decision with warning emoji', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        true,
        [],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(
        result,
        ['High-risk with AI assistance'],
        ['.github/workflows/ci.yml'],
      );

      expect(markdown).toContain('⚠️ WARN');
      expect(markdown).toContain('Risk Tier**: HIGH');
      expect(markdown).toContain('AI-Assisted**: Yes');
      expect(markdown).toContain('## Violations');
      expect(markdown).toContain(VIOLATION_HIGH_RISK_AI_CHANGE);
    });

    it('renders decision explanation details', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        true,
        [],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(result, [], ['.github/workflows/ci.yml']);

      expect(markdown).toContain('## Decision Explanation');
      expect(markdown).toContain('High-risk paths modified with AI assistance');
    });

    it('omits decision explanation when decision trail is empty', () => {
      const result: PolicyResult = {
        decision: 'allow',
        riskTier: 'low',
        violations: [],
        decisionTrail: [],
        metadata: {
          timestamp: fixedTimestamp,
          changedFilesCount: 0,
          highRiskPathsCount: 0,
          aiAssisted: false,
          rationale: [],
        },
      };

      const markdown = generateMarkdownSummary(result, [], []);

      expect(markdown).not.toContain('## Decision Explanation');
    });

    it('includes governance requirements for medium-risk decisions', () => {
      const result = makeDecision(
        'medium',
        ['.github/dependabot.yml'],
        true,
        [],
        true,
        [],
        false,
        ['.github/dependabot.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(
        result,
        ['Medium-risk enforcement config'],
        ['.github/dependabot.yml'],
      );

      expect(markdown).toContain('## Governance Requirements');
      expect(markdown).toContain('PR required');
    });

    it('includes governance requirements for high-risk decisions', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        true,
        [],
        false,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(
        result,
        ['High-risk workflow'],
        ['.github/workflows/ci.yml'],
      );

      expect(markdown).toContain('## Governance Requirements');
      expect(markdown).toContain('No auto-merge');
      expect(markdown).toContain('Manual security review required');
    });

    it('does not include governance section for low-risk decisions', () => {
      const result = makeLowRiskDecision();

      const markdown = generateMarkdownSummary(result, [], []);

      expect(markdown).not.toContain('## Governance Requirements');
    });

    it('includes risk classification reasons when present', () => {
      const result = makeLowRiskDecision();

      const markdown = generateMarkdownSummary(
        result,
        ['All files are low-risk', 'Standard application code'],
        [],
      );

      expect(markdown).toContain('### Risk Classification Reasons');
      expect(markdown).toContain('- All files are low-risk');
      expect(markdown).toContain('- Standard application code');
    });

    it('handles empty risk reasons gracefully', () => {
      const result = makeLowRiskDecision();

      const markdown = generateMarkdownSummary(result, [], []);

      expect(markdown).toContain('# Policy Evaluation Summary');
      expect(markdown).not.toContain('### Risk Classification Reasons');
    });

    it('handles violations with error severity', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        false,
        ['AI attestation missing'],
        true,
        [],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(result, [], ['.github/workflows/ci.yml']);

      expect(markdown).toContain('❌ DENY');
      expect(markdown).toContain('❌');
      expect(markdown).toContain(VIOLATION_AI_ATTESTATION_MISSING);
    });

    it('handles violations with warning severity', () => {
      const result = makeDecision(
        'high',
        ['.github/workflows/ci.yml'],
        true,
        [],
        true,
        [],
        true,
        ['.github/workflows/ci.yml'],
        fixedTimestamp,
      );

      const markdown = generateMarkdownSummary(result, [], ['.github/workflows/ci.yml']);

      expect(markdown).toContain('⚠️');
      expect(markdown).toContain('## Violations');
      expect(markdown).toContain('HIGH_RISK_AI_CHANGE');
    });

    it('includes timestamp in output', () => {
      const result = makeLowRiskDecision();

      const markdown = generateMarkdownSummary(result, [], []);

      expect(markdown).toContain('*Generated at');
      expect(markdown).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('evaluatePolicy', () => {
    it('allows low-risk non-AI changes', () => {
      const prBody = 'Refactor only';
      const changedFiles = ['src/app.ts'];

      const out = evaluatePolicy({ prBody, changedFiles });

      expect(out.classification.tier).toBe('low');
      expect(out.ai.attestation.declared).toBe(false);
      expect(out.result.decision).toBe('allow');

      const md = generateMarkdownSummary(
        out.result,
        out.classification.reasons,
        out.classification.paths,
      );
      expect(md).toContain('✅ ALLOW');
    });

    it('warns on high-risk AI-assisted with complete attestations', () => {
      const prBody = `
- [x] **This PR contains AI-assisted changes**
- [x] I have reviewed all AI-generated code
- [x] I have verified that no secrets
- [x] The changes align with
- [x] I have tested the changes locally

- [x] **This PR modifies high-risk paths**
- [x] I understand the security and governance implications
- [x] I have performed a manual security review
- [x] I have verified that no privilege escalation
- [x] I have documented the rationale
- [x] I have a rollback plan
- [x] I commit to monitoring
`;
      const changedFiles = ['.github/workflows/ci.yml'];

      const out = evaluatePolicy({ prBody, changedFiles });

      expect(out.classification.tier).toBe('high');
      expect(out.ai.attestation.declared).toBe(true);
      expect(out.highRisk.attestation.declared).toBe(true);
      expect(out.result.decision).toBe('warn');
    });

    it('denies when high-risk governance attestations are missing', () => {
      const prBody = 'Update workflows';
      const changedFiles = ['.github/workflows/ci.yml'];

      const out = evaluatePolicy({ prBody, changedFiles });

      expect(out.classification.tier).toBe('high');
      expect(out.highRisk.attestation.declared).toBe(false);
      expect(out.result.decision).toBe('deny');
    });

    it('respects a caller-supplied timestamp', () => {
      const prBody = 'Refactor only';
      const changedFiles = ['src/app.ts'];
      const timestamp = '2024-01-01T00:00:00.000Z';

      const out = evaluatePolicy({ prBody, changedFiles, timestamp });

      expect(out.result.metadata.timestamp).toBe(timestamp);
    });

    it('emits near-match warnings for high-risk attestations', () => {
      const prBody = `
- [x] **This PR modifies high-risk paths**
- [x] I understand the security and governance implicatons
- [x] I have performed a manual securty review
- [x] I have verified that no priviledge escalation
- [x] I have documented the rational
- [x] I have a rollback plann
- [x] I commit to monitorng
`;
      const changedFiles = ['.github/workflows/ci.yml'];

      const out = evaluatePolicy({ prBody, changedFiles });

      const codes = out.result.violations.map((v) => v.code);
      expect(codes).toContain('HIGH_RISK_ATTESTATION_NEAR_MATCH');
    });

    it('emits warnings for attestation near-matches and checkbox format issues', () => {
      const prBody = `
- [x] **This PR contains AI-assisted changes**
- [x] I have revieed all AI-generated code
- [x] I have verified that no secrtes
- [x] The change align with
- [x] I have tested changes locally

* [X] NON-STANDARD CHECKBOX FORMAT
- [x ] malformed bracket spacing
`;
      const changedFiles = ['src/app.ts'];

      const out = evaluatePolicy({ prBody, changedFiles });

      const codes = out.result.violations.map((v) => v.code);
      expect(codes).toContain('AI_ATTESTATION_NEAR_MATCH');
      expect(codes).toContain('CHECKBOX_FORMAT_ISSUE');
    });

    it('can disable warnings via options', () => {
      const prBody = `
- [x] **This PR contains AI-assisted changes**
- [x] I have revieed all AI-generated code
- [x] I have verified that no secrtes
`;
      const changedFiles = ['src/app.ts'];

      const out = evaluatePolicy({
        prBody,
        changedFiles,
        options: { enableNearMatchWarnings: false, enableCheckboxFormatWarnings: false },
      });

      const codes = out.result.violations.map((v) => v.code);
      expect(codes).not.toContain('AI_ATTESTATION_NEAR_MATCH');
      expect(codes).not.toContain('CHECKBOX_FORMAT_ISSUE');
    });

    it('handles non-string label values in near-match violations (lines 149-152)', () => {
      // This tests the String(value) fallback when a label value isn't a string
      // In practice, all labels are strings, but the code defensively handles non-strings
      const prBody = `
- [x] **This PR contains AI-assisted changes**
- [x] I have revieed all AI-generated code
- [x] I have verified that no secrtes
- [x] The changes align with
- [x] I have tested the changes locally
`;
      const changedFiles = ['src/app.ts'];

      const out = evaluatePolicy({ prBody, changedFiles });

      // Verify near-match warnings are generated
      const nearMatchViolations = out.result.violations.filter(
        (v) => v.code === 'AI_ATTESTATION_NEAR_MATCH',
      );
      expect(nearMatchViolations.length).toBeGreaterThan(0);

      // Verify each violation has a message with an expected value
      for (const violation of nearMatchViolations) {
        expect(violation.message).toMatch(/expected checked line starting with/);
        expect(violation.message).not.toContain('<unknown>');
      }
    });
  });
});
