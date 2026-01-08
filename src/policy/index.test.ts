/**
 * Policy Engine - Public API Export Tests
 *
 * Verifies that all exports from the policy index are correctly re-exported
 * and accessible for consumers
 */

import { describe, expect, it } from 'vitest';

import type { EvaluatePolicyInput, EvaluatePolicyOptions, EvaluatePolicyOutput } from './index.js';
import * as policyExports from './index.js';

describe('Policy Engine Public API', () => {
  it('exports and executes attestation functions', () => {
    // Verify exports exist
    expect(typeof policyExports.parseAIAttestation).toBe('function');
    expect(typeof policyExports.parseHighRiskAttestation).toBe('function');
    expect(typeof policyExports.validateAttestation).toBe('function');
    expect(typeof policyExports.validateHighRiskAttestation).toBe('function');

    // Execute to register coverage
    const prBody = 'Test PR body with no attestations';
    const aiAttestation = policyExports.parseAIAttestation(prBody);
    expect(aiAttestation).toBeDefined();

    const highRiskAttestation = policyExports.parseHighRiskAttestation(prBody);
    expect(highRiskAttestation).toBeDefined();

    const aiValidation = policyExports.validateAttestation(aiAttestation, 'low');
    expect(aiValidation).toBeDefined();

    const highRiskValidation = policyExports.validateHighRiskAttestation(
      highRiskAttestation,
      false,
    );
    expect(highRiskValidation).toBeDefined();
  });

  it('exports and executes decision functions', () => {
    // Verify exports exist
    expect(typeof policyExports.generateMarkdownSummary).toBe('function');
    expect(typeof policyExports.makeDecision).toBe('function');
    expect(typeof policyExports.serializeToJSON).toBe('function');

    // Execute to register coverage
    const decision = policyExports.makeDecision(
      'low',
      [],
      true,
      [],
      true,
      [],
      false,
      ['test.ts'],
      '2024-01-01T00:00:00.000Z',
    );
    expect(decision).toBeDefined();

    const json = policyExports.serializeToJSON(decision);
    expect(json).toBeDefined();

    const markdown = policyExports.generateMarkdownSummary(decision, [], []);
    expect(markdown).toContain('Policy Evaluation Summary');
  });

  it('exports orchestration helpers and violation codes', () => {
    // Orchestration API
    expect(typeof policyExports.evaluatePolicy).toBe('function');
    const input: EvaluatePolicyInput = { prBody: '', changedFiles: [] };
    const options: EvaluatePolicyOptions = {};
    const out: EvaluatePolicyOutput = policyExports.evaluatePolicy({ ...input, options });
    expect(out.result).toBeDefined();
    expect(out.classification).toBeDefined();

    // Violation code constants
    expect(policyExports.VIOLATION_AI_ATTESTATION_MISSING).toBeDefined();
    expect(policyExports.VIOLATION_HIGH_RISK_GOVERNANCE_MISSING).toBeDefined();
    expect(policyExports.VIOLATION_HIGH_RISK_AI_CHANGE).toBeDefined();
    expect(policyExports.VIOLATION_AI_ATTESTATION_NEAR_MATCH).toBeDefined();
    expect(policyExports.VIOLATION_HIGH_RISK_ATTESTATION_NEAR_MATCH).toBeDefined();
    expect(policyExports.VIOLATION_CHECKBOX_FORMAT_ISSUE).toBeDefined();
  });

  it('exports and executes risk classification functions', () => {
    // Verify exports exist
    expect(typeof policyExports.classifyRisk).toBe('function');
    expect(typeof policyExports.getGovernanceRequirements).toBe('function');
    expect(typeof policyExports.getRiskDescription).toBe('function');

    // Execute to register coverage
    const classification = policyExports.classifyRisk(['src/test.ts']);
    expect(classification).toBeDefined();
    expect(classification.tier).toBe('low');

    const requirements = policyExports.getGovernanceRequirements('low');
    expect(requirements).toBeDefined();

    const description = policyExports.getRiskDescription('low');
    expect(description).toBeDefined();
  });

  it('exports and uses HIGH_RISK_PATTERNS constant', () => {
    // Verify export exists
    expect(policyExports.HIGH_RISK_PATTERNS).toBeDefined();
    expect(
      Array.isArray(policyExports.HIGH_RISK_PATTERNS) ||
        typeof policyExports.HIGH_RISK_PATTERNS === 'object',
    ).toBe(true);

    // Execute to register coverage
    const patterns = policyExports.HIGH_RISK_PATTERNS;
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('allows importing and executing specific functions individually', async () => {
    const { classifyRisk, makeDecision, parseAIAttestation } = await import('./index.js');

    expect(typeof classifyRisk).toBe('function');
    expect(typeof makeDecision).toBe('function');
    expect(typeof parseAIAttestation).toBe('function');

    // Execute to register coverage
    const classification = classifyRisk(['test.ts']);
    expect(classification.tier).toBe('low');

    const attestation = parseAIAttestation('no AI');
    expect(attestation.declared).toBe(false);

    const decision = makeDecision(
      'low',
      [],
      true,
      [],
      true,
      [],
      false,
      ['test.ts'],
      '2024-01-01T00:00:00.000Z',
    );
    expect(decision.decision).toBe('allow');
  });

  it('executes complete policy workflow through public API', () => {
    // Test the full workflow using only exported functions
    const changedFiles = ['.github/workflows/ci.yml'];
    const prBody = 'Update workflow';

    // Step 1: Classify risk
    const classification = policyExports.classifyRisk(changedFiles);
    expect(classification.tier).toBe('high');

    // Step 2: Parse attestations
    const aiAttestation = policyExports.parseAIAttestation(prBody);
    const highRiskAttestation = policyExports.parseHighRiskAttestation(prBody);

    // Step 3: Validate attestations
    const aiValidation = policyExports.validateAttestation(aiAttestation, classification.tier);
    const highRiskValidation = policyExports.validateHighRiskAttestation(
      highRiskAttestation,
      classification.tier === 'high',
    );

    // Step 4: Make decision
    const decision = policyExports.makeDecision(
      classification.tier,
      classification.paths,
      aiValidation.valid,
      aiValidation.missing,
      highRiskValidation.valid,
      highRiskValidation.missing,
      aiAttestation.declared,
      changedFiles,
      '2024-01-01T00:00:00.000Z',
    );

    expect(decision.decision).toBe('deny');

    // Step 5: Generate outputs
    const json = policyExports.serializeToJSON(decision);
    const parsed = JSON.parse(json);
    expect(parsed.decision).toBe('deny');

    const markdown = policyExports.generateMarkdownSummary(
      decision,
      classification.reasons,
      classification.paths,
    );
    expect(markdown).toContain('DENY');
  });
});
