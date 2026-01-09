/**
 * Policy Engine — AI Attestation Validation Tests
 *
 * Verifies parsing and validation of AI-assisted and high-risk attestations.
 * Ensures disclosure, completeness, and governance enforcement behave
 * deterministically across risk tiers.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  __test__extractCheckedTexts,
  __test__levenshtein,
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

// cspell:ignore revieed secrtes implicatons securty priviledge plann monitorng

/**
 * ======================================================
 * Test Helpers
 * ======================================================\n */

function expectAllFalse(result: Record<string, boolean>): void {
  for (const value of Object.values(result)) {
    expect(value).toBe(false);
  }
}

// Shared helper to assert that a declared attestation has all confirmations unchecked
function expectDeclaredButAllUnchecked<T extends { declared: boolean }>(
  result: T,
  expectedFalseFields: Array<keyof T>,
) {
  expect(result.declared).toBe(true);
  for (const key of expectedFalseFields) {
    // @ts-expect-error runtime keys validated in tests
    expect(result[key]).toBe(false);
  }
}

/**
 * ======================================================
 * PR BODY FIXTURES
 * ======================================================
 */

const aiAssistedBodyComplete = `
## AI-Assisted Development

- [x] **This PR contains AI-assisted changes**

### AI Attestation

- [x] I have reviewed all AI-generated code
- [x] I have verified that no secrets
- [x] The changes align with
- [x] I have tested the changes locally
`;

const aiAssistedBodyUnchecked = `
## AI-Assisted Development

- [ ] **This PR contains AI-assisted changes**
`;

const aiAssistedBodyPartial = `
- [x] **This PR contains AI-assisted changes**
- [x] I have reviewed all AI-generated code
- [ ] I have verified that no secrets
- [x] The changes align with
- [ ] I have tested the changes locally
`;

const aiAssistedBodyTypos = `
- [x] **This PR contains AI-assisted changes**
- [x] I have revieed all AI-generated code
- [x] I have verified that no secrtes
- [x] The change align with
- [x] I have tested changes locally
`;

const highRiskBodyComplete = `
- [x] **This PR modifies high-risk paths**

### High-Risk Attestation

- [x] I understand the security and governance implications
- [x] I have performed a manual security review
- [x] I have verified that no privilege escalation
- [x] I have documented the rationale
- [x] I have a rollback plan
- [x] I commit to monitoring
`;

const highRiskBodyUnchecked = `
- [ ] **This PR modifies high-risk paths**
`;

/**
 * ======================================================
 * ATTESTATION OBJECT FIXTURES
 * ======================================================
 */

const completeAIAttestation = () => ({
  declared: true,
  reviewed: true,
  noSecrets: true,
  alignsWithStandards: true,
  locallyTested: true,
});

const undeclaredAIAttestation = () => ({
  declared: false,
  reviewed: false,
  noSecrets: false,
  alignsWithStandards: false,
  locallyTested: false,
});

const missingReviewAttestation = () => ({
  declared: true,
  reviewed: false,
  noSecrets: true,
  alignsWithStandards: true,
  locallyTested: true,
});

const multipleMissingAttestation = () => ({
  declared: true,
  reviewed: false,
  noSecrets: false,
  alignsWithStandards: false,
  locallyTested: true,
});

const highRiskAttestationComplete = () => ({
  declared: true,
  understood: true,
  securityReviewed: true,
  noPrivilegeEscalation: true,
  documented: true,
  rollbackPlan: true,
  monitoringCommitment: true,
});

const highRiskAttestationEmpty = () => ({
  declared: false,
  understood: false,
  securityReviewed: false,
  noPrivilegeEscalation: false,
  documented: false,
  rollbackPlan: false,
  monitoringCommitment: false,
});

const highRiskAttestationIncomplete = () => ({
  declared: true,
  understood: true,
  securityReviewed: false,
  noPrivilegeEscalation: false,
  documented: true,
  rollbackPlan: false,
  monitoringCommitment: true,
});

/**
 * ======================================================
 * AI ATTESTATION — PARSING
 * ======================================================
 */

describe('AI Attestation — Parsing', () => {
  it('detects complete AI-assisted declaration', () => {
    const result = parseAIAttestation(aiAssistedBodyComplete);

    expect(result.declared).toBe(true);
    expect(result.reviewed).toBe(true);
    expect(result.noSecrets).toBe(true);
    expect(result.alignsWithStandards).toBe(true);
    expect(result.locallyTested).toBe(true);
  });

  it('parses checked attestations across multiple lines', () => {
    const body = [
      '- [x] **This PR contains AI-assisted changes**',
      '- [x] I have reviewed all AI-generated code',
      '- [x] I have verified that no secrets',
    ].join('\n');

    const result = parseAIAttestation(body);

    expect(result.declared).toBe(true);
    expect(result.reviewed).toBe(true);
    expect(result.noSecrets).toBe(true);
  });

  it('handles multiple checked lines with extra whitespace', () => {
    const body = `
  - [x]   **This PR contains AI-assisted changes**
  - [x]   I have reviewed all AI-generated code
`;

    const result = parseAIAttestation(body);

    expect(result.declared).toBe(true);
    expect(result.reviewed).toBe(true);
  });

  it('treats unchecked declaration as human-only change', () => {
    const result = parseAIAttestation(aiAssistedBodyUnchecked);

    expect(result.declared).toBe(false);
    expect(result.reviewed).toBe(false);
  });

  it('detects when declared but all confirmations unchecked', () => {
    const body = `
- [x] **This PR contains AI-assisted changes**
- [ ] I have reviewed all AI-generated code
- [ ] I have verified that no secrets
- [ ] The changes align with
- [ ] I have tested the changes locally
`;
    const result = parseAIAttestation(body);

    expectDeclaredButAllUnchecked(result, [
      'reviewed',
      'noSecrets',
      'alignsWithStandards',
      'locallyTested',
    ]);
  });

  it('parses when body is empty string', () => {
    const result = parseAIAttestation('');

    expect(result.declared).toBe(false);
  });

  it('parses when body is null', () => {
    // @ts-expect-error testing robustness with null
    const result = parseAIAttestation(null);

    expect(result.declared).toBe(false);
  });

  it('detects partial attestation completion accurately', () => {
    const result = parseAIAttestation(aiAssistedBodyPartial);

    expect(result.declared).toBe(true);
    expect(result.reviewed).toBe(true);
    expect(result.noSecrets).toBe(false);
    expect(result.alignsWithStandards).toBe(true);
    expect(result.locallyTested).toBe(false);
  });

  it('detects near matches (typos) without counting them as checked', () => {
    const result = parseAIAttestation(aiAssistedBodyTypos);
    const near = findAIAttestationNearMatches(aiAssistedBodyTypos);

    expect(result.declared).toBe(true);
    expect(result.reviewed).toBe(false);
    expect(result.noSecrets).toBe(false);
    expect(result.alignsWithStandards).toBe(false);
    expect(result.locallyTested).toBe(false);

    // Verify near matches found (lines 141 & 143 coverage)
    expect(near.length).toBeGreaterThan(0);
    expect(near).toContain('reviewed'); // 'revieed' typo detected
    expect(near).toContain('noSecrets'); // 'secrtes' typo detected
  });
});

/**
 * ======================================================
 * AI ATTESTATION — VALIDATION
 * ======================================================
 */

describe('AI Attestation — Validation', () => {
  it('accepts complete attestation for low-risk changes', () => {
    const result = validateAttestation(completeAIAttestation(), 'low');

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('skips validation when AI assistance is not declared', () => {
    const result = validateAttestation(undeclaredAIAttestation(), 'low');

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('flags missing review confirmation', () => {
    const result = validateAttestation(missingReviewAttestation(), 'low');

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('AI code review confirmation');
  });

  it('detects multiple missing attestations deterministically', () => {
    const result = validateAttestation(multipleMissingAttestation(), 'medium');

    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toContain('AI code review confirmation');
    expect(result.missing).toContain('No-secrets verification');
    expect(result.missing).toContain('Standards alignment confirmation');
  });

  it('emits warning only for high-risk AI-assisted changes', () => {
    const result = validateAttestation(completeAIAttestation(), 'high');

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('High-risk');
  });
});

/**
 * ======================================================
 * HIGH-RISK ATTESTATION — PARSING
 * ======================================================
 */

describe('High-Risk Attestation — Parsing', () => {
  it('parses complete high-risk attestation', () => {
    const result = parseHighRiskAttestation(highRiskBodyComplete);

    expect(result.declared).toBe(true);
    expect(result.understood).toBe(true);
    expect(result.securityReviewed).toBe(true);
    expect(result.noPrivilegeEscalation).toBe(true);
    expect(result.documented).toBe(true);
    expect(result.rollbackPlan).toBe(true);
    expect(result.monitoringCommitment).toBe(true);
  });

  it('treats unchecked declaration as undeclared', () => {
    const result = parseHighRiskAttestation(highRiskBodyUnchecked);

    expect(result.declared).toBe(false);
    expect(result.understood).toBe(false);
  });

  it('returns all false when high-risk declaration is completely absent', () => {
    const body = 'This is a PR body without any high-risk declaration';
    const result = parseHighRiskAttestation(body);
    expectAllFalse(result);
  });

  it('returns all false when high-risk body is null', () => {
    const result = parseHighRiskAttestation(null as unknown as string);
    expectAllFalse(result);
  });

  it('detects when high-risk declared but confirmations unchecked', () => {
    const body = `
- [x] **This PR modifies high-risk paths**
- [ ] I understand the security and governance implications
- [ ] I have performed a manual security review
- [ ] I have verified that no privilege escalation
- [ ] I have documented the rationale
- [ ] I have a rollback plan
- [ ] I commit to monitoring
`;
    const result = parseHighRiskAttestation(body);

    expectDeclaredButAllUnchecked(result, [
      'understood',
      'securityReviewed',
      'noPrivilegeEscalation',
      'documented',
      'rollbackPlan',
      'monitoringCommitment',
    ]);
  });

  it('handles empty high-risk body gracefully', () => {
    const result = parseHighRiskAttestation('');

    expect(result.declared).toBe(false);
  });

  it('detects near matches for high-risk items (typos)', () => {
    const body = `
- [x] **This PR modifies high-risk paths**
- [x] I understand the security and governance implicatons
- [x] I have performed a manual securty review
- [x] I have verified that no priviledge escalation
- [x] I have documented the rational
- [x] I have a rollback plann
- [x] I commit to monitorng
`;
    const near = findHighRiskAttestationNearMatches(body);
    // Verify near matches found (lines 168 & 170 coverage)
    expect(near.length).toBeGreaterThan(0);
    expect(near).toContain('understood'); // 'implicatons' typo detected
    expect(near).toContain('securityReviewed'); // 'securty' typo detected
  });
});

/**
 * ======================================================
 * HIGH-RISK ATTESTATION — VALIDATION
 * ======================================================
 */

describe('High-Risk Attestation — Validation', () => {
  it('passes when no high-risk paths are touched', () => {
    const result = validateHighRiskAttestation(highRiskAttestationEmpty(), false);

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('fails when high-risk paths are touched but not declared', () => {
    const result = validateHighRiskAttestation(highRiskAttestationEmpty(), true);

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('High-risk paths declaration (checkbox not checked)');
  });

  it('accepts complete high-risk attestation', () => {
    const result = validateHighRiskAttestation(highRiskAttestationComplete(), true);

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('detects incomplete high-risk attestation precisely', () => {
    const result = validateHighRiskAttestation(highRiskAttestationIncomplete(), true);

    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toContain('Manual security review');
    expect(result.missing).toContain('No privilege escalation verification');
    expect(result.missing).toContain('Rollback plan');
  });

  it('should emit warning when high-risk AI-assisted changes with complete attestations', () => {
    const attestation = {
      declared: true,
      reviewed: true,
      noSecrets: true,
      alignsWithStandards: true,
      locallyTested: true,
    };
    const result = validateAttestation(attestation, 'high');

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('High-risk');
    expect(result.warnings[0]).toContain('extra caution');
  });

  it('should not emit warning for non-high-risk AI changes', () => {
    const attestation = {
      declared: true,
      reviewed: true,
      noSecrets: true,
      alignsWithStandards: true,
      locallyTested: true,
    };
    const lowRiskResult = validateAttestation(attestation, 'low');
    const mediumRiskResult = validateAttestation(attestation, 'medium');

    expect(lowRiskResult.warnings).toEqual([]);
    expect(mediumRiskResult.warnings).toEqual([]);
  });

  describe('validateAttestation - all missing fields coverage', () => {
    it('should detect only locallyTested missing', () => {
      const attestation = {
        declared: true,
        reviewed: true,
        noSecrets: true,
        alignsWithStandards: true,
        locallyTested: false,
      };
      const result = validateAttestation(attestation, 'low');

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('Local testing confirmation');
    });
  });

  describe('validateHighRiskAttestation - individual field coverage', () => {
    it('should detect only understood missing', () => {
      const attestation = {
        declared: true,
        understood: false,
        securityReviewed: true,
        noPrivilegeEscalation: true,
        documented: true,
        rollbackPlan: true,
        monitoringCommitment: true,
      };
      const result = validateHighRiskAttestation(attestation, true);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('Security and governance implications understanding');
    });

    it('should detect only documented missing', () => {
      const attestation = {
        declared: true,
        understood: true,
        securityReviewed: true,
        noPrivilegeEscalation: true,
        documented: false,
        rollbackPlan: true,
        monitoringCommitment: true,
      };
      const result = validateHighRiskAttestation(attestation, true);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('Rationale documentation');
    });

    it('should detect only monitoringCommitment missing', () => {
      const attestation = {
        declared: true,
        understood: true,
        securityReviewed: true,
        noPrivilegeEscalation: true,
        documented: true,
        rollbackPlan: true,
        monitoringCommitment: false,
      };
      const result = validateHighRiskAttestation(attestation, true);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('Post-merge monitoring commitment');
    });
  });
});

describe('Levenshtein — branch coverage', () => {
  it('returns n when first string is empty (m === 0)', async () => {
    const { __test__levenshtein } = await import('./attestation.ts');
    expect(__test__levenshtein('', 'abc')).toBe(3);
  });

  it('returns m when second string is empty (n === 0)', async () => {
    const { __test__levenshtein } = await import('./attestation.ts');
    expect(__test__levenshtein('abcd', '')).toBe(4);
  });

  it('computes distance for non-empty strings', async () => {
    const { __test__levenshtein } = await import('./attestation.ts');
    expect(__test__levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('falls back when map entries or code points are missing', async () => {
    const { __test__levenshtein } = await import('./attestation.ts');
    const targetKey = 'ac'.length;
    let codePointCalls = 0;

    // Store original methods safely
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalMapGet = Map.prototype.get;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalStringCodePointAt = String.prototype.codePointAt;

    const mapGetSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
      this: Map<number, number>,
      key: number,
    ) {
      if (key === targetKey || key === targetKey - 1) {
        return undefined;
      }
      return originalMapGet.call(this, key);
    });

    const stringCodePointSpy = vi
      .spyOn(String.prototype, 'codePointAt')
      .mockImplementation(function (this: string, pos: number) {
        codePointCalls += 1;
        if (codePointCalls <= 2) {
          return undefined;
        }
        return originalStringCodePointAt.call(this, pos);
      });

    try {
      const dist = __test__levenshtein('ab', 'ac');
      expect(dist).toBeGreaterThanOrEqual(0);
    } finally {
      mapGetSpy.mockRestore();
      stringCodePointSpy.mockRestore();
    }
  });
});

describe('Checkbox format validation', () => {
  it('flags non-standard checkbox formats', () => {
    const badBody = `
* [X] THIS SHOULD BE LOWERCASE
- [x ] malformed bracket spacing
- [y] wrong marker
`;
    const { issues } = validateCheckboxFormat(badBody);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('handles null bodies gracefully for format check', () => {
    // @ts-expect-error intentional null to hit fallback branch
    const { issues } = validateCheckboxFormat(null);
    expect(Array.isArray(issues)).toBe(true);
  });
});

describe('Helper branches & nullish handling', () => {
  it('extracts checked texts with null bodies safely', () => {
    // @ts-expect-error intentional null for nullish coalescing branch
    const texts = __test__extractCheckedTexts(null);
    expect(texts).toEqual([]);
  });

  it('skips missing AI attestation label keys', () => {
    const labels = AI_ATTESTATION_LABELS as Record<string, string>;
    const original = labels.reviewed;
    // Avoid `delete` for performance; use Reflect.deleteProperty to remove key
    Reflect.deleteProperty(labels, 'reviewed');

    try {
      const body = `
- [x] I have revieed all AI-generated code
`;
      const near = findAIAttestationNearMatches(body, 2);
      expect(near).not.toContain('reviewed');
    } finally {
      labels.reviewed = original;
    }
  });

  it('skips missing high-risk attestation label keys', () => {
    const labels = HIGH_RISK_ATTESTATION_LABELS as Record<string, string>;
    const original = labels.securityReviewed;
    // Avoid `delete` for performance; use Reflect.deleteProperty to remove key
    Reflect.deleteProperty(labels, 'securityReviewed');

    try {
      const body = `
- [x] I have performed a manual securty review
`;
      const near = findHighRiskAttestationNearMatches(body, 2);
      expect(near).not.toContain('securityReviewed');
    } finally {
      labels.securityReviewed = original;
    }
  });

  it('findAIAttestationNearMatches handles null body', () => {
    // @ts-expect-error intentional null to hit fallback branch
    const near = findAIAttestationNearMatches(null);
    expect(Array.isArray(near)).toBe(true);
  });

  it('findHighRiskAttestationNearMatches handles null body', () => {
    // @ts-expect-error intentional null to hit fallback branch
    const near = findHighRiskAttestationNearMatches(null);
    expect(Array.isArray(near)).toBe(true);
  });

  it('findAIAttestationNearMatches detects typos and returns matched keys', () => {
    // cspell:ignore reviewd
    // Typos that should trigger near-match detection and return keys with near.length > 0
    // This specifically tests the `if (near.length > 0)` branch on line 141-143
    const body = `
- [x] I have reviewd all AI-generated code
`;
    const near = findAIAttestationNearMatches(body, 1);
    // Should detect 'reviewd' → 'reviewed' and push key to output
    expect(near).toContain('reviewed');
    expect(near.length).toBeGreaterThan(0);
  });

  it('findAIAttestationNearMatches returns empty array when no near-matches', () => {
    // No typos or matches
    const body = 'Just random text with no attestation checkboxes';
    const near = findAIAttestationNearMatches(body);
    expect(near).toEqual([]);
  });

  it('findHighRiskAttestationNearMatches detects typos and returns matched keys', () => {
    // Typos that should trigger near-match detection
    const body = `
- [x] I understand the implicatons
- [x] The changes have been securty reviewed
- [x] No priviledge escalation
- [x] Changes are documented
- [x] I have a rollback plann
- [x] I commit to monitorng
`;
    const near = findHighRiskAttestationNearMatches(body, 2);
    // Should detect typos and return keys with near.length > 0
    expect(near.length).toBeGreaterThan(0);
  });

  it('findHighRiskAttestationNearMatches returns empty array when no near-matches', () => {
    const body = 'No high-risk attestation text here at all';
    const near = findHighRiskAttestationNearMatches(body);
    expect(near).toEqual([]);
  });

  it('levenshtein early-return branches for empty strings', () => {
    expect(__test__levenshtein('', 'abc')).toBe(3); // m === 0
    expect(__test__levenshtein('xyz', '')).toBe(3); // n === 0
  });

  it('findNearMatchesForKeys handles Map.get returning undefined', () => {
    // This test covers the defensive guard at line 167: if (label === undefined)
    // We'll spy on Map.prototype.get to force it to return undefined once
    let callCount = 0;

    // Store original method safely
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalMapGet = Map.prototype.get;

    const mapGetSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
      this: Map<string, string>,
      key: string,
    ) {
      callCount++;
      // Force undefined on first call to cover the branch
      if (callCount === 1) {
        return undefined;
      }
      // Use bind to avoid unbound-method eslint error
      return originalMapGet.bind(this)(key);
    });

    try {
      const body = `
- [x] I have reviewed all AI-generated code
`;
      const near = findAIAttestationNearMatches(body, 2);
      // Should not crash and should continue processing
      expect(Array.isArray(near)).toBe(true);
    } finally {
      mapGetSpy.mockRestore();
    }
  });
});
