/**
 * Policy Engine — Risk Classification Tests
 *
 * Verifies deterministic, precedence-aware classification of changed files
 * into risk tiers, along with governance requirement derivation.
 *
 * These tests assert:
 * - correct tier assignment
 * - strict precedence (high > medium > low)
 * - stable, human-readable outputs
 */

import { describe, expect, it } from 'vitest';
import {
  classifyRisk,
  classifyRiskWithConfig,
  getGovernanceRequirements,
  getRiskDescription,
  HIGH_RISK_RULES,
} from './index.ts';

describe('Policy Engine — Risk Classification', () => {
  /**
   * ============================================
   * classifyRisk
   * ============================================
   */
  describe('classifyRisk', () => {
    it('classifies workflow changes as high risk', () => {
      const files = ['.github/workflows/ci.yml', 'src/index.ts'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('.github/workflows/ci.yml');
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('classifies GitHub action changes as high risk', () => {
      const files = ['.github/actions/setup/action.yml'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('.github/actions/setup/action.yml');
    });

    it('classifies executable scripts as high risk', () => {
      const files = ['scripts/deploy.ts', 'tools/build.ts'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('scripts/deploy.ts');
      expect(result.paths).toContain('tools/build.ts');
    });

    it('classifies package.json as high risk', () => {
      const files = ['package.json', 'src/index.ts'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('package.json');
    });

    it('classifies lockfiles as high risk', () => {
      const files = ['package-lock.json'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('package-lock.json');
    });

    it('classifies security configuration files as high risk', () => {
      const files = ['.gitleaks.toml', 'codeql-config.yml'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths.length).toBe(2);
    });

    it('classifies .yaml security configuration files as high risk', () => {
      const files = ['.github/dependabot.yaml', '.github/scorecard.yaml', 'codeql-config.yaml'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('.github/dependabot.yaml');
      expect(result.paths).toContain('.github/scorecard.yaml');
      expect(result.paths).toContain('codeql-config.yaml');
    });

    it('classifies enforcement configuration as medium risk', () => {
      const files = ['tsconfig.json', 'biome.json'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('medium');
      expect(result.paths).toContain('tsconfig.json');
      expect(result.paths).toContain('biome.json');
    });

    it('classifies documentation-only changes as low risk', () => {
      const files = ['README.md', 'docs/guide.md'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('low');
      expect(result.paths).toEqual([]);
      expect(result.reasons.length).toBe(1);
    });

    it('classifies application source code as low risk', () => {
      const files = ['src/index.ts', 'src/utils/helper.ts'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('low');
    });

    it('prioritizes high risk over medium risk when both are present', () => {
      const files = ['tsconfig.json', '.github/workflows/ci.yml', 'src/index.ts'];
      const result = classifyRisk(files);

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('.github/workflows/ci.yml');
    });

    it('handles an empty change set as low risk', () => {
      const files: string[] = [];
      const result = classifyRisk(files);

      expect(result.tier).toBe('low');
      expect(result.paths).toEqual([]);
    });
  });

  /**
   * ============================================
   * getRiskDescription
   * ============================================
   */
  describe('getRiskDescription', () => {
    it('returns a correct description for high risk', () => {
      const description = getRiskDescription('high');

      expect(description).toContain('High-risk');
      expect(description).toContain('trust boundaries');
    });

    it('returns a correct description for medium risk', () => {
      const description = getRiskDescription('medium');

      expect(description).toContain('Medium-risk');
      expect(description).toContain('enforcement');
    });

    it('returns a correct description for low risk', () => {
      const description = getRiskDescription('low');

      expect(description).toContain('Low-risk');
    });
  });

  /**
   * ============================================
   * getGovernanceRequirements
   * ============================================
   */
  describe('getGovernanceRequirements', () => {
    it('returns strict governance requirements for high risk', () => {
      const requirements = getGovernanceRequirements('high');

      expect(requirements).toContain('PR required');
      expect(requirements).toContain('No auto-merge');
      expect(requirements).toContain('High-risk attestation required');
      expect(requirements).toContain('Manual security review required');
    });

    it('returns moderate governance requirements for medium risk', () => {
      const requirements = getGovernanceRequirements('medium');

      expect(requirements).toContain('PR required');
      expect(requirements).toContain('Branch must be up-to-date');
    });

    it('returns minimal governance requirements for low risk', () => {
      const requirements = getGovernanceRequirements('low');

      expect(requirements).toContain('Standard checks must pass');
      expect(requirements.length).toBe(1);
    });
  });

  /**
   * ============================================
   * classifyRiskWithConfig
   * ============================================
   */
  describe('classifyRiskWithConfig', () => {
    it('treats configured patterns as additive high risk', () => {
      const files = ['k8s/deployment.yaml', 'src/app.ts'];
      const result = classifyRiskWithConfig(files, { highRisk: [/^k8s\//] });

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('k8s/deployment.yaml');
    });

    it('treats configured patterns as additive medium risk', () => {
      const files = ['Makefile', 'src/app.ts'];
      const result = classifyRiskWithConfig(files, { mediumRisk: [/^Makefile$/] });

      expect(result.tier).toBe('medium');
      expect(result.paths).toContain('Makefile');
    });

    it('handles low-risk files with no config overrides', () => {
      const files = ['src/app.ts', 'README.md'];
      const result = classifyRiskWithConfig(files, { highRisk: [], mediumRisk: [] });

      expect(result.tier).toBe('low');
      expect(result.paths).toEqual([]);
    });

    it('prioritizes high-risk over medium-risk even with config', () => {
      const files = ['k8s/deployment.yaml', 'Makefile', 'src/app.ts'];
      const result = classifyRiskWithConfig(files, {
        highRisk: [/^k8s\//],
        mediumRisk: [/^Makefile$/],
      });

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('k8s/deployment.yaml');
      expect(result.paths).not.toContain('Makefile');
    });

    it('returns empty config when neither override provided', () => {
      const files = ['src/app.ts'];
      const result = classifyRiskWithConfig(files);

      expect(result.tier).toBe('low');
      expect(result.paths).toEqual([]);
    });

    it('sorts reasons and paths deterministically', () => {
      const files = ['package.json', 'src/app.ts', '.github/workflows/ci.yml'];
      const result = classifyRiskWithConfig(files);

      expect(result.tier).toBe('high');
      expect(result.paths[0]).toBe('.github/workflows/ci.yml');
      expect(result.paths[1]).toBe('package.json');
      const sorted = result.reasons.every((r, i, arr) => i === 0 || r >= (arr[i - 1] as string));
      expect(sorted).toBe(true);
    });

    it('preserves default patterns while adding custom ones', () => {
      const files = ['package.json', 'custom-risk.yaml'];
      const result = classifyRiskWithConfig(files, {
        highRisk: [/^custom-risk/],
      });

      expect(result.tier).toBe('high');
      expect(result.paths).toContain('package.json');
      expect(result.paths).toContain('custom-risk.yaml');
    });
  });

  /**
   * ============================================
   * Regex Safety & Performance (ReDoS guardrails)
   * ============================================
   */
  describe('regex performance and safety', () => {
    it('evaluates classification within a reasonable time budget for long paths', () => {
      const long = 'a'.repeat(8000);
      const files = [
        `.github/${long}.yaml`, // medium-risk pattern worst-case-ish
        `src/${long}.tsx`, // low-risk non-match
        `docker/${long}/Dockerfile`, // high-risk dir prefix
        `scripts/${long}.ts`, // high-risk scripts pattern
      ];

      const start = Date.now();
      const result = classifyRisk(files);
      const durationMs = Date.now() - start;

      expect(result.tier === 'high' || result.tier === 'medium' || result.tier === 'low').toBe(
        true,
      );
      // Generous threshold to avoid flakiness while still catching pathological regex
      expect(durationMs).toBeLessThan(500);
    });

    it('high-risk regexes are bounded and fast on adversarial-like input', () => {
      const adversarial = 'x'.repeat(12_000);
      const nonYaml = `${adversarial}.txt`;
      const pathish = `dir/${adversarial}/file`;

      // Probe each high-risk pattern individually to ensure no catastrophic backtracking
      for (const rule of HIGH_RISK_RULES) {
        const t0 = Date.now();
        // run a few probes: non-matching plain, and path-like
        const used =
          rule.pattern.test(nonYaml) ||
          rule.pattern.test(pathish) ||
          rule.pattern.test(adversarial);
        const dt = Date.now() - t0;
        expect(typeof used).toBe('boolean');
        expect(dt).toBeLessThan(100);
      }
    });
  });
});
