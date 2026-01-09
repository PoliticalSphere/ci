/**
 * Policy Engine Workflow Tests
 *
 * Integration tests verifying complete end-to-end workflows:
 * Changed Files → Risk Classification → Attestation Validation → Policy Decision
 *
 * Each scenario exercises the full policy engine with realistic PR conditions,
 * validating correct behavior across module boundaries.
 */

import { describe, expect, it } from 'vitest';
import {
  parseAIAttestation,
  parseHighRiskAttestation,
  validateAttestation,
  validateHighRiskAttestation,
} from './attestation.ts';
import {
  generateMarkdownSummary,
  makeDecision,
  VIOLATION_AI_ATTESTATION_MISSING,
  VIOLATION_HIGH_RISK_GOVERNANCE_MISSING,
} from './decision.ts';
import { classifyRisk } from './risk-classification.ts';

const fixedTimestamp = '2024-01-01T00:00:00.000Z';

/**
 * ============================================
 * Test Helpers
 * ============================================
 */

interface WorkflowSetupResult {
  riskClassification: ReturnType<typeof classifyRisk>;
  highRiskValidation: ReturnType<typeof validateHighRiskAttestation>;
  decision: ReturnType<typeof makeDecision>;
  markdown: string;
}

interface HighRiskAIWorkflowSetupResult {
  riskClassification: ReturnType<typeof classifyRisk>;
  aiValidation: ReturnType<typeof validateAttestation>;
  highRiskValidation: ReturnType<typeof validateHighRiskAttestation>;
  decision: ReturnType<typeof makeDecision>;
}

function setupHighRiskWorkflow(
  changedFiles: readonly string[],
  pullRequestBody: string,
): WorkflowSetupResult {
  const riskClassification = classifyRisk(changedFiles);
  const highRiskAttestation = parseHighRiskAttestation(pullRequestBody);
  const highRiskValidation = validateHighRiskAttestation(highRiskAttestation, true);

  const decision = makeDecision({
    riskTier: riskClassification.tier,
    riskPaths: riskClassification.paths,
    attestationValid: true,
    attestationMissing: [],
    highRiskAttestationValid: highRiskValidation.valid,
    highRiskAttestationMissing: highRiskValidation.missing,
    aiAssisted: false,
    changedFiles,
    timestamp: fixedTimestamp,
  });

  const markdown = generateMarkdownSummary(
    decision,
    riskClassification.reasons,
    riskClassification.paths,
  );

  return { riskClassification, highRiskValidation, decision, markdown };
}

function setupHighRiskAIWorkflow(
  changedFiles: readonly string[],
  pullRequestBody: string,
): HighRiskAIWorkflowSetupResult {
  const riskClassification = classifyRisk(changedFiles);
  const aiAttestation = parseAIAttestation(pullRequestBody);
  const aiValidation = validateAttestation(aiAttestation, riskClassification.tier);
  const highRiskAttestation = parseHighRiskAttestation(pullRequestBody);
  const highRiskValidation = validateHighRiskAttestation(highRiskAttestation, true);

  const decision = makeDecision({
    riskTier: riskClassification.tier,
    riskPaths: riskClassification.paths,
    attestationValid: aiValidation.valid,
    attestationMissing: aiValidation.missing,
    highRiskAttestationValid: highRiskValidation.valid,
    highRiskAttestationMissing: highRiskValidation.missing,
    aiAssisted: true,
    changedFiles,
    timestamp: fixedTimestamp,
  });

  return { riskClassification, aiValidation, highRiskValidation, decision };
}

/**
 * ============================================
 * Realistic Pull Request Scenarios
 * ============================================
 */

const prWithApplicationCodeOnly = `
## Description
Refactored utility functions for better performance.
`;

const prWithAIAssistanceAndCompleteAttestations = `
## Description
AI-assisted refactoring of utility functions.

## AI-Assisted Development

- [x] **This PR contains AI-assisted changes**

### AI Attestation

- [x] I have reviewed all AI-generated code
- [x] I have verified that no secrets
- [x] The changes align with
- [x] I have tested the changes locally
`;

const prWithAIAssistanceAndMissingAttestations = `
## Description
AI-assisted bug fixes.

- [x] **This PR contains AI-assisted changes**
- [x] I have reviewed all AI-generated code
- [ ] I have verified that no secrets
- [x] The changes align with
- [ ] I have tested the changes locally
`;

const prWithHighRiskPathsAndCompleteGovernanceAttestations = `
## Description
Updating GitHub workflow security settings.

- [x] **This PR modifies high-risk paths**

### High-Risk Attestation

- [x] I understand the security and governance implications
- [x] I have performed a manual security review
- [x] I have verified that no privilege escalation
- [x] I have documented the rationale
- [x] I have a rollback plan
- [x] I commit to monitoring
`;

const prWithHighRiskPathsButNoAttestations = `
## Description
Updated GitHub workflow files.
`;

/**
 * ============================================
 * End-to-End Workflow Tests
 * ============================================
 */

describe('Policy Engine Workflow', () => {
  /**
   * Scenario 1: Low-risk application code
   * Files: Only source code and documentation
   * AI Assistance: No
   * Expected: ALLOW (no violations, no governance required)
   */
  describe('Scenario 1: Low-risk application code without AI', () => {
    it('should allow standard application code changes', () => {
      const changedFiles = ['src/utils/helpers.ts', 'src/components/Button.tsx', 'README.md'];
      const pullRequestBody = prWithApplicationCodeOnly;

      // Classify risk
      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('low');

      // Parse attestations
      const aiAttestation = parseAIAttestation(pullRequestBody);
      expect(aiAttestation.declared).toBe(false);

      // Make decision
      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: true,
        attestationMissing: [],
        highRiskAttestationValid: true,
        highRiskAttestationMissing: [],
        aiAssisted: false,
        changedFiles,
        timestamp: fixedTimestamp,
      });
      expect(decision.decision).toBe('allow');
      expect(decision.violations).toHaveLength(0);
    });

    it('should exclude governance requirements from low-risk output', () => {
      const changedFiles = ['src/index.ts'];
      const riskClassification = classifyRisk(changedFiles);
      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: true,
        attestationMissing: [],
        highRiskAttestationValid: true,
        highRiskAttestationMissing: [],
        aiAssisted: false,
        changedFiles,
        timestamp: fixedTimestamp,
      });

      const markdown = generateMarkdownSummary(decision, [], []);
      expect(markdown).toContain('✅ ALLOW');
      expect(markdown).not.toContain('## Governance Requirements');
    });
  });

  /**
   * Scenario 2: Medium-risk enforcement configuration
   * Files: Linter/formatter config files
   * AI Assistance: No
   * Expected: ALLOW (with governance requirements listed)
   */
  describe('Scenario 2: Medium-risk configuration without AI', () => {
    it('should allow medium-risk enforcement config', () => {
      const changedFiles = ['biome.json', 'tsconfig.json', 'src/app.ts'];
      const pullRequestBody = prWithApplicationCodeOnly;

      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('medium');

      const aiAttestation = parseAIAttestation(pullRequestBody);
      expect(aiAttestation.declared).toBe(false);

      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: true,
        attestationMissing: [],
        highRiskAttestationValid: true,
        highRiskAttestationMissing: [],
        aiAssisted: false,
        changedFiles,
        timestamp: fixedTimestamp,
      });
      expect(decision.decision).toBe('allow');
      expect(decision.violations).toHaveLength(0);

      const markdown = generateMarkdownSummary(
        decision,
        riskClassification.reasons,
        riskClassification.paths,
      );
      expect(markdown).toContain('## Governance Requirements');
      expect(markdown).toContain('PR required');
    });
  });

  /**
   * Scenario 3: Low-risk with complete AI attestations
   * Files: Application code
   * AI Assistance: Yes, with all attestations checked
   * Expected: ALLOW
   */
  describe('Scenario 3: Low-risk AI changes with complete attestations', () => {
    it('should allow AI changes when all attestations complete', () => {
      const changedFiles = ['src/helpers/format.ts', 'src/helpers/parse.ts'];
      const pullRequestBody = prWithAIAssistanceAndCompleteAttestations;

      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('low');

      const aiAttestation = parseAIAttestation(pullRequestBody);
      expect(aiAttestation.declared).toBe(true);

      const aiValidation = validateAttestation(aiAttestation, riskClassification.tier);
      expect(aiValidation.valid).toBe(true);

      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: aiValidation.valid,
        attestationMissing: aiValidation.missing,
        highRiskAttestationValid: true,
        highRiskAttestationMissing: [],
        aiAssisted: true,
        changedFiles,
        timestamp: fixedTimestamp,
      });
      expect(decision.decision).toBe('allow');
      expect(decision.violations).toHaveLength(0);
      expect(decision.metadata.aiAssisted).toBe(true);
    });
  });

  /**
   * Scenario 4: Low-risk with incomplete AI attestations
   * Files: Application code
   * AI Assistance: Yes, with missing attestations
   * Expected: DENY (AI attestation missing violations)
   */
  describe('Scenario 4: Low-risk AI changes with incomplete attestations', () => {
    it('should deny AI changes when attestations incomplete', () => {
      const changedFiles = ['src/utils/calc.ts'];
      const pullRequestBody = prWithAIAssistanceAndMissingAttestations;

      const riskClassification = classifyRisk(changedFiles);
      const aiAttestation = parseAIAttestation(pullRequestBody);
      expect(aiAttestation.declared).toBe(true);

      const aiValidation = validateAttestation(aiAttestation, riskClassification.tier);
      expect(aiValidation.valid).toBe(false);

      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: aiValidation.valid,
        attestationMissing: aiValidation.missing,
        highRiskAttestationValid: true,
        highRiskAttestationMissing: [],
        aiAssisted: true,
        changedFiles,
        timestamp: fixedTimestamp,
      });
      expect(decision.decision).toBe('deny');
      expect(decision.violations.length).toBeGreaterThan(0);
      expect(decision.violations.every((v) => v.code === VIOLATION_AI_ATTESTATION_MISSING)).toBe(
        true,
      );
    });
  });

  /**
   * Scenario 5: High-risk paths without governance attestations
   * Files: Workflow files, package.json
   * AI Assistance: No
   * Expected: DENY (high-risk governance missing)
   */
  describe('Scenario 5: High-risk changes without governance attestations', () => {
    it('should deny high-risk changes without attestations', () => {
      const changedFiles = ['.github/workflows/ci.yml', 'package.json', 'src/app.ts'];
      const pullRequestBody = prWithHighRiskPathsButNoAttestations;

      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('high');

      const highRiskAttestation = parseHighRiskAttestation(pullRequestBody);
      expect(highRiskAttestation.declared).toBe(false);

      const highRiskValidation = validateHighRiskAttestation(
        highRiskAttestation,
        riskClassification.paths.length > 0,
      );
      expect(highRiskValidation.valid).toBe(false);

      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: true,
        attestationMissing: [],
        highRiskAttestationValid: highRiskValidation.valid,
        highRiskAttestationMissing: highRiskValidation.missing,
        aiAssisted: false,
        changedFiles,
        timestamp: fixedTimestamp,
      });
      expect(decision.decision).toBe('deny');
      expect(
        decision.violations.some((v) => v.code === VIOLATION_HIGH_RISK_GOVERNANCE_MISSING),
      ).toBe(true);
    });

    it('should render deny emoji with governance requirements', () => {
      const changedFiles = ['.github/workflows/ci.yml'];
      const pullRequestBody = prWithHighRiskPathsButNoAttestations;

      const { markdown } = setupHighRiskWorkflow(changedFiles, pullRequestBody);
      expect(markdown).toContain('❌ DENY');
      expect(markdown).toContain('## Governance Requirements');
      expect(markdown).toContain('No auto-merge');
    });
  });

  /**
   * Scenario 6: High-risk paths with complete governance attestations
   * Files: Workflow and dependabot config
   * AI Assistance: No
   * Expected: ALLOW
   */
  describe('Scenario 6: High-risk changes with complete attestations', () => {
    it('should allow high-risk changes when governance attestations complete', () => {
      const changedFiles = ['.github/workflows/ci.yml', '.github/dependabot.yml'];
      const pullRequestBody = prWithHighRiskPathsAndCompleteGovernanceAttestations;

      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('high');

      const highRiskAttestation = parseHighRiskAttestation(pullRequestBody);
      expect(highRiskAttestation.declared).toBe(true);

      const highRiskValidation = validateHighRiskAttestation(highRiskAttestation, true);
      expect(highRiskValidation.valid).toBe(true);

      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: true,
        attestationMissing: [],
        highRiskAttestationValid: highRiskValidation.valid,
        highRiskAttestationMissing: highRiskValidation.missing,
        aiAssisted: false,
        changedFiles,
        timestamp: fixedTimestamp,
      });
      expect(decision.decision).toBe('allow');
      expect(decision.violations).toHaveLength(0);
    });
  });

  /**
   * Scenario 7: High-risk paths with AI and complete attestations
   * Files: Workflow files with AI changes
   * AI Assistance: Yes, all attestations complete
   * Governance Attestations: Complete
   * Expected: WARN (non-blocking warning, not denied)
   */
  describe('Scenario 7: High-risk AI changes with complete attestations', () => {
    it('should warn (not deny) on high-risk AI with complete attestations', () => {
      const changedFiles = ['.github/workflows/ci.yml', 'src/policy.ts'];
      const pullRequestBody = `
${prWithAIAssistanceAndCompleteAttestations}

${prWithHighRiskPathsAndCompleteGovernanceAttestations}
`;

      const { riskClassification, aiValidation, highRiskValidation, decision } =
        setupHighRiskAIWorkflow(changedFiles, pullRequestBody);
      expect(riskClassification.tier).toBe('high');
      expect(aiValidation.valid).toBe(true);
      expect(highRiskValidation.valid).toBe(true);
      expect(decision.decision).toBe('warn');
      expect(decision.violations).toHaveLength(1);
      expect(decision.violations[0]?.code).toBe('HIGH_RISK_AI_CHANGE');
      expect(decision.violations[0]?.severity).toBe('warning');
    });

    it('should render warn emoji in output', () => {
      const changedFiles = ['.github/workflows/deploy.yml'];
      const pullRequestBody = `
${prWithAIAssistanceAndCompleteAttestations}
${prWithHighRiskPathsAndCompleteGovernanceAttestations}
`;

      const { riskClassification, decision } = setupHighRiskAIWorkflow(
        changedFiles,
        pullRequestBody,
      );

      const markdown = generateMarkdownSummary(
        decision,
        riskClassification.reasons,
        riskClassification.paths,
      );
      expect(markdown).toContain('⚠️ WARN');
      expect(markdown).toContain('AI assistance');
    });
  });

  /**
   * Scenario 8: High-risk AI with incomplete AI attestations
   * Files: Workflow files with AI changes
   * AI Assistance: Yes, with missing attestations
   * Governance Attestations: Complete
   * Expected: DENY (missing AI attestations override warn)
   */
  describe('Scenario 8: High-risk AI changes with incomplete attestations', () => {
    it('should deny when AI attestations missing (deny precedence)', () => {
      const changedFiles = ['.github/workflows/ci.yml', 'src/app.ts'];
      const pullRequestBody = `
${prWithAIAssistanceAndMissingAttestations}
${prWithHighRiskPathsAndCompleteGovernanceAttestations}
`;

      const { aiValidation, highRiskValidation, decision } = setupHighRiskAIWorkflow(
        changedFiles,
        pullRequestBody,
      );
      expect(aiValidation.valid).toBe(false);
      expect(highRiskValidation.valid).toBe(true);
      expect(decision.decision).toBe('deny');
      expect(decision.violations.some((v) => v.code === VIOLATION_AI_ATTESTATION_MISSING)).toBe(
        true,
      );
    });
  });

  /**
   * Scenario 9: Mixed-tier file changes
   * Files: Both low-risk and high-risk files
   * Expected: Classification prioritizes highest risk tier
   */
  describe('Scenario 9: Mixed-tier file changes', () => {
    it('should classify as high-risk when any file is high-risk', () => {
      const changedFiles = ['src/app.ts', 'src/utils.ts', '.github/workflows/ci.yml', 'README.md'];

      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('high');
      expect(riskClassification.paths).toContain('.github/workflows/ci.yml');
    });

    it('should require high-risk governance when mixed-tier files present', () => {
      const changedFiles = ['src/app.ts', '.github/workflows/ci.yml'];
      const pullRequestBody = prWithHighRiskPathsButNoAttestations;

      const riskClassification = classifyRisk(changedFiles);
      const highRiskAttestation = parseHighRiskAttestation(pullRequestBody);
      const highRiskValidation = validateHighRiskAttestation(
        highRiskAttestation,
        riskClassification.paths.length > 0,
      );

      expect(riskClassification.tier).toBe('high');
      expect(highRiskValidation.valid).toBe(false);
    });
  });

  /**
   * Scenario 10: Complex multi-violation scenario
   * Files: High-risk workflow + dependency file
   * AI Assistance: Yes, with incomplete attestations
   * Governance: Not declared
   * Expected: DENY with both AI and governance violations aggregated
   */
  describe('Scenario 10: Complex multi-violation scenarios', () => {
    it('should aggregate AI and governance violations', () => {
      const changedFiles = ['.github/workflows/ci.yml', 'package.json'];
      const pullRequestBodyWithPartialAI = `
- [x] **This PR contains AI-assisted changes**
- [ ] I have reviewed all AI-generated code
- [ ] I have verified that no secrets
`;

      const riskClassification = classifyRisk(changedFiles);
      expect(riskClassification.tier).toBe('high');

      const aiAttestation = parseAIAttestation(pullRequestBodyWithPartialAI);
      const aiValidation = validateAttestation(aiAttestation, riskClassification.tier);
      expect(aiValidation.valid).toBe(false);

      const highRiskAttestation = parseHighRiskAttestation(pullRequestBodyWithPartialAI);
      const highRiskValidation = validateHighRiskAttestation(highRiskAttestation, true);
      expect(highRiskValidation.valid).toBe(false);

      const decision = makeDecision({
        riskTier: riskClassification.tier,
        riskPaths: riskClassification.paths,
        attestationValid: aiValidation.valid,
        attestationMissing: aiValidation.missing,
        highRiskAttestationValid: highRiskValidation.valid,
        highRiskAttestationMissing: highRiskValidation.missing,
        aiAssisted: true,
        changedFiles,
        timestamp: fixedTimestamp,
      });

      expect(decision.decision).toBe('deny');
      expect(decision.violations.length).toBeGreaterThan(1);
      expect(decision.violations.some((v) => v.code === 'AI_ATTESTATION_MISSING')).toBe(true);
      expect(decision.violations.some((v) => v.code === 'HIGH_RISK_GOVERNANCE_MISSING')).toBe(true);
    });

    it('should render complete violation report in markdown', () => {
      const changedFiles = ['.github/workflows/ci.yml'];
      const pullRequestBody = prWithHighRiskPathsButNoAttestations;

      const { markdown } = setupHighRiskWorkflow(changedFiles, pullRequestBody);
      expect(markdown).toContain('❌ DENY');
      expect(markdown).toContain('## Violations');
      expect(markdown).toContain('## Governance Requirements');
      expect(markdown).toContain('Manual security review required');
    });
  });
});
