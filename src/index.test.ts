/**
 * PoliticalSphere CI - Main Entry Point Tests
 *
 * Verifies that all exports from the main index are correctly accessible
 * and that the package configuration is properly defined
 */

import { describe, expect, it } from 'vitest';

import * as ciExports from './index.js';

describe('PoliticalSphere CI - Main Entry Point', () => {
  it('exports VERSION constant', () => {
    expect(ciExports.VERSION).toBe('0.0.1');
    expect(typeof ciExports.VERSION).toBe('string');
  });

  it('exports config object', () => {
    expect(ciExports.config).toBeDefined();
    expect(typeof ciExports.config).toBe('object');
  });

  it('config has correct structure', () => {
    expect(ciExports.config).toHaveProperty('version');
    expect(ciExports.config).toHaveProperty('tiers');
    expect(ciExports.config.version).toBe('0.0.1');
  });

  it('config tiers array contains expected linters', () => {
    const { tiers } = ciExports.config;
    expect(Array.isArray(tiers)).toBe(true);
    expect(tiers).toContain('biome');
    expect(tiers).toContain('eslint');
    expect(tiers).toContain('typescript');
    expect(tiers).toContain('knip');
    expect(tiers).toContain('orthogonal');
    expect(tiers).toContain('policy');
    expect(tiers).toHaveLength(6);
  });

  it('exports all policy attestation functions', () => {
    expect(typeof ciExports.parseAIAttestation).toBe('function');
    expect(typeof ciExports.parseHighRiskAttestation).toBe('function');
    expect(typeof ciExports.validateAttestation).toBe('function');
    expect(typeof ciExports.validateHighRiskAttestation).toBe('function');
  });

  it('exports all policy decision functions', () => {
    expect(typeof ciExports.generateMarkdownSummary).toBe('function');
    expect(typeof ciExports.makeDecision).toBe('function');
    expect(typeof ciExports.serializeToJSON).toBe('function');
  });

  it('exports all risk classification functions', () => {
    expect(typeof ciExports.classifyRisk).toBe('function');
    expect(typeof ciExports.getGovernanceRequirements).toBe('function');
    expect(typeof ciExports.getRiskDescription).toBe('function');
  });

  it('exports HIGH_RISK_PATTERNS constant', () => {
    expect(ciExports.HIGH_RISK_PATTERNS).toBeDefined();
    expect(
      Array.isArray(ciExports.HIGH_RISK_PATTERNS) ||
        typeof ciExports.HIGH_RISK_PATTERNS === 'object',
    ).toBe(true);
  });

  it('allows importing specific exports individually', async () => {
    const { VERSION, config, classifyRisk } = await import('./index.js');

    expect(VERSION).toBe('0.0.1');
    expect(config).toBeDefined();
    expect(typeof classifyRisk).toBe('function');
  });

  it('version matches config version', () => {
    expect(ciExports.VERSION).toBe(ciExports.config.version);
  });

  it('has all policy engine components available', () => {
    const policyFunctions = [
      'parseAIAttestation',
      'parseHighRiskAttestation',
      'validateAttestation',
      'validateHighRiskAttestation',
      'generateMarkdownSummary',
      'makeDecision',
      'serializeToJSON',
      'classifyRisk',
      'getGovernanceRequirements',
      'getRiskDescription',
      'HIGH_RISK_PATTERNS',
    ];

    for (const funcName of policyFunctions) {
      expect(ciExports).toHaveProperty(funcName);
    }
  });
});
