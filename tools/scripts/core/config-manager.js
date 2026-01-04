#!/usr/bin/env node

/**
 * ==============================================================================
 * Political Sphere — Configuration Manager
 * ==============================================================================
 *
 * Purpose:
 *   Unified configuration management system that provides centralized loading,
 *   validation, caching, and dependency tracking for all platform policies and
 *   configurations across CI, lint, and security domains.
 *
 * Features:
 *   - Single source of truth for config discovery and loading
 *   - Centralized validation logic with clear error messages
 *   - Dependency resolution and circular dependency detection
 *   - Configuration caching to avoid repeated file I/O
 *   - Support for multiple config formats (YAML, JSON, TOML, plain text)
 *   - Clear audit trail for all config operations
 *
 * Usage:
 *   import { ConfigManager } from './config-manager.js';
 *
 *   const manager = new ConfigManager({ repoRoot, platformRoot });
 *   const config = manager.getPolicy('action-pinning');
 *   const validated = manager.validateConfig('action-pinning', config);
 *   const deps = manager.resolveDependencies('action-pinning');
 *
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

/**
 * ConfigManager - Centralized configuration loading and validation
 */
export class ConfigManager {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.platformRoot = options.platformRoot || this.repoRoot;
    this.configsRoot = path.join(this.platformRoot, 'configs');
    this.policiesRoot = path.join(this.configsRoot, 'ci', 'policies');

    // Cache loaded configs to avoid repeated I/O
    this.cache = new Map();

    // Track loaded config metadata (path, hash, timestamp)
    this.metadata = new Map();

    // Policy type registry for discovery and validation
    this.policyRegistry = this._initializePolicyRegistry();

    // Dependency graph for cycle detection
    this.dependencyGraph = new Map();

    this.isInitialized = false;
  }

  /**
   * Initialize the configuration manager by discovering all available policies
   */
  initialize() {
    if (this.isInitialized) return;

    // Discover all policies from the registry
    for (const [policyName, metadata] of this.policyRegistry) {
      // Skip js-module types as they must be imported directly
      if (metadata.type === 'js-module') {
        continue;
      }
      try {
        this.getPolicy(policyName);
      } catch (err) {
        // If a policy fails to load but is not required, continue
        if (!metadata.required) {
          continue;
        }
        throw err;
      }
    }

    this.isInitialized = true;
  }

  /**
   * Initialize the policy registry with all known policies and their metadata
   */
  _initializePolicyRegistry() {
    const registry = new Map();

    // CI Policies
    registry.set('validate-ci', {
      path: 'ci/policies/validate-ci.yml',
      type: 'yaml',
      required: true,
      category: 'ci-governance',
    });
    registry.set('action-pinning', {
      path: 'ci/policies/action-pinning.yml',
      type: 'yaml',
      required: true,
      category: 'ci-governance',
    });
    registry.set('allowed-actions', {
      path: 'ci/policies/allowed-actions.yml',
      type: 'yaml',
      required: true,
      category: 'ci-governance',
    });
    registry.set('permissions-baseline', {
      path: 'ci/policies/permissions-baseline.yml',
      type: 'yaml',
      required: true,
      category: 'ci-governance',
    });
    registry.set('high-risk-triggers', {
      path: 'ci/policies/high-risk-triggers.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('harden-runner', {
      path: 'ci/policies/harden-runner.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('inline-bash', {
      path: 'ci/policies/inline-bash.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('secrets-handling', {
      path: 'ci/policies/secrets-handling.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('unsafe-patterns', {
      path: 'ci/policies/unsafe-patterns.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('unsafe-patterns-allowlist', {
      path: 'ci/policies/unsafe-patterns-allowlist.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('artifact-policy', {
      path: 'ci/policies/artifact-policy.yml',
      type: 'yaml',
      required: false,
      category: 'ci-governance',
    });
    registry.set('naming-policy', {
      path: 'ci/policies/naming-policy.json',
      type: 'json',
      required: false,
      category: 'ci-governance',
    });

    // Lint Configurations
    registry.set('eslint', {
      path: 'lint/eslint.config.mjs',
      type: 'js-module',
      required: true,
      category: 'lint',
    });
    registry.set('biome', {
      path: '../biome.json', // Biome config at repo root, not in configs/
      type: 'json',
      required: true,
      category: 'lint',
    });
    registry.set('yamllint', {
      path: 'lint/yamllint.yml',
      type: 'yaml',
      required: true,
      category: 'lint',
    });
    registry.set('actionlint', {
      path: 'lint/actionlint.yml',
      type: 'yaml',
      required: false,
      category: 'lint',
    });
    registry.set('hadolint', {
      path: 'lint/hadolint.yaml',
      type: 'yaml',
      required: false,
      category: 'lint',
    });
    registry.set('shellcheck', {
      path: 'lint/shellcheckrc',
      type: 'text',
      required: false,
      category: 'lint',
    });
    registry.set('markdownlint', {
      path: 'lint/markdownlint.jsonc',
      type: 'jsonc',
      required: false,
      category: 'lint',
    });
    registry.set('cspell', {
      path: 'lint/.cspell.json',
      type: 'json',
      required: false,
      category: 'lint',
    });
    registry.set('knip', {
      path: 'lint/.kniprc',
      type: 'json',
      required: false,
      category: 'lint',
    });
    registry.set('jscpd', {
      path: 'lint/jscpd.json',
      type: 'json',
      required: false,
      category: 'lint',
    });
    registry.set('tsconfig', {
      path: 'lint/tsconfig.base.json',
      type: 'jsonc',
      required: true,
      category: 'lint',
    });

    // Security Configurations
    registry.set('gitleaks', {
      path: 'security/gitleaks.toml',
      type: 'toml',
      required: false,
      category: 'security',
    });
    registry.set('license-policy', {
      path: 'security/license-policy.yml',
      type: 'yaml',
      required: false,
      category: 'security',
    });
    registry.set('trivy', {
      path: 'security/trivy.yaml',
      type: 'yaml',
      required: false,
      category: 'security',
    });
    registry.set('tooling-versions', {
      path: 'security/tooling.env',
      type: 'env',
      required: false,
      category: 'security',
    });

    // Consumer Contract
    registry.set('consumer-contract', {
      path: 'consumer/contract.json',
      type: 'json',
      required: false,
      category: 'contracts',
    });
    registry.set('consumer-exceptions', {
      path: 'consumer/exceptions.json',
      type: 'json',
      required: false,
      category: 'contracts',
    });

    return registry;
  }

  /**
   * Get a policy by name, loading from disk if not cached
   */
  getPolicy(name) {
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }

    const metadata = this.policyRegistry.get(name);
    if (!metadata) {
      throw new Error(`Unknown policy: ${name}`);
    }

    const filePath = path.join(this.configsRoot, metadata.path);
    if (!fs.existsSync(filePath)) {
      if (metadata.required) {
        throw new Error(`Required policy file not found: ${filePath}`);
      }
      return null; // Optional policy not found
    }

    try {
      const content = this._loadConfigFile(filePath, metadata.type);
      this.cache.set(name, content);
      this.metadata.set(name, {
        path: filePath,
        type: metadata.type,
        timestamp: new Date(),
      });

      return content;
    } catch (err) {
      throw new Error(`Failed to load policy '${name}' from ${filePath}: ${err.message}`);
    }
  }

  /**
   * Load a configuration file based on its type
   */
  _loadConfigFile(filePath, type) {
    const content = fs.readFileSync(filePath, 'utf8');

    switch (type) {
      case 'yaml':
        return yaml.parse(content);
      case 'json':
        return JSON.parse(content);
      case 'jsonc': {
        // Remove comments from JSON5-like syntax
        const cleaned = content
          .replaceAll(/\/\*[\s\S]*?\*\//g, '') // Block comments
          .replaceAll(/\/\/.*$/gm, ''); // Line comments
        return JSON.parse(cleaned);
      }
      case 'env':
        return this._parseEnvFile(content);
      case 'text':
        return content;
      case 'toml':
        return this._parseTomlFile(content);
      case 'js-module':
        // JS modules should be imported dynamically
        throw new Error(
          `JS modules must be imported directly, not loaded by ConfigManager: ${filePath}`,
        );
      default:
        return content;
    }
  }

  /**
   * Parse environment variable file into an object
   */
  _parseEnvFile(content) {
    const result = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      result[key] = value;
    }
    return result;
  }

  /**
   * Parse basic TOML file (simplified, only for gitleaks config)
   * For full TOML support, consider a dedicated library
   */
  _parseTomlValue(valueStr) {
    if (valueStr === 'true') return true;
    if (valueStr === 'false') return false;
    if (!Number.isNaN(Number(valueStr))) return Number(valueStr);
    if (valueStr.startsWith('"') && valueStr.endsWith('"'))
      return valueStr.slice(1, -1);
    if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      return valueStr
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim());
    }
    return valueStr;
  }

  _parseTomlFile(content) {
    const result = {};
    let currentSection = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Section headers like [rule]
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        result[currentSection] = result[currentSection] || {};
        continue;
      }

      // Key-value pairs
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      const valueStr = trimmed.slice(eqIndex + 1).trim();
      const value = this._parseTomlValue(valueStr);

      if (currentSection) {
        result[currentSection][key] = value;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Validate a configuration against its schema
   */
  validateConfig(name, config) {
    const metadata = this.policyRegistry.get(name);
    if (!metadata) {
      throw new Error(`Unknown policy for validation: ${name}`);
    }

    const errors = [];

    // Basic type validation
    switch (metadata.category) {
      case 'ci-governance':
        errors.push(...this._validateCIPolicy(name, config));
        break;
      case 'lint':
        errors.push(...this._validateLintConfig(name, config));
        break;
      case 'security':
        errors.push(...this._validateSecurityConfig(name, config));
        break;
      case 'contracts':
        errors.push(...this._validateContract(name, config));
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      policyName: name,
    };
  }

  /**
   * Validate CI policy configuration
   */
  _validateCIPolicy(name, config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      errors.push(`Policy '${name}' must be an object`);
      return errors;
    }

    // Policy-specific validation
    switch (name) {
      case 'validate-ci':
        if (!config.rules || typeof config.rules !== 'object') {
          errors.push("'validate-ci' policy must have 'rules' object");
        }
        break;
      case 'allowed-actions':
        if (!config.allowlist || typeof config.allowlist !== 'object') {
          errors.push("'allowed-actions' policy must have 'allowlist' section");
        }
        break;
      case 'permissions-baseline':
        if (!config.permissions || typeof config.permissions !== 'object') {
          errors.push(
            "'permissions-baseline' policy must have 'permissions' object",
          );
        }
        break;
    }

    return errors;
  }

  /**
   * Validate lint configuration
   */
  _validateLintConfig(name, config) {
    const errors = [];

    if (config === null || config === undefined) {
      errors.push(`Lint config '${name}' is empty`);
      return errors;
    }

    // Most lint configs are flexible, just ensure they're not completely invalid
    if (
      typeof config !== 'object' &&
      typeof config !== 'string' &&
      !Array.isArray(config)
    ) {
      errors.push(
        `Lint config '${name}' has unexpected type: ${typeof config}`,
      );
    }

    return errors;
  }

  /**
   * Validate security configuration
   */
  _validateSecurityConfig(name, config) {
    const errors = [];

    if (config === null || config === undefined) {
      if (name !== 'gitleaks' && name !== 'trivy') {
        errors.push(`Security config '${name}' is empty`);
      }
      return errors;
    }

    if (name === 'license-policy') {
      if (!config.allowlist && !config.denylist) {
        errors.push(
          "'license-policy' must have 'allowlist' or 'denylist' section",
        );
      }
    }

    return errors;
  }

  /**
   * Validate consumer contract
   */
  _validateContract(name, config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      errors.push(`Contract '${name}' must be an object`);
      return errors;
    }

    if (name === 'consumer-contract') {
      if (!config.version) {
        errors.push("'consumer-contract' must have 'version' field");
      }
    }

    return errors;
  }

  /**
   * Resolve dependencies for a policy using the dependency graph
   */
  resolveDependencies(policyName, visited = new Set()) {
    if (visited.has(policyName)) {
      throw new Error(
        `Circular dependency detected: ${Array.from(visited).join(' -> ')} -> ${policyName}`,
      );
    }

    visited.add(policyName);

    // Load dependency graph if not already loaded
    if (!this.dependencyGraph.has(policyName)) {
      this._loadDependencyGraph();
    }

    const deps = this.dependencyGraph.get(policyName) || [];
    const result = [];

    for (const dep of deps) {
      result.push(dep, ...this.resolveDependencies(dep, new Set(visited)));
    }

    // Remove duplicates while preserving order
    return Array.from(new Map(result.map((item) => [item, item])).values());
  }

  /**
   * Load dependency graph from policy-dependencies.yml
   */
  _loadDependencyGraph() {
    const depPath = path.join(this.configsRoot, 'policy-dependencies.yml');

    if (!fs.existsSync(depPath)) {
      return; // No dependency file, continue without it
    }

    const content = fs.readFileSync(depPath, 'utf8');
    const depData = yaml.parse(content);

    if (!depData || typeof depData !== 'object') {
      return;
    }

    for (const [policyName, policyDeps] of Object.entries(depData)) {
      const dependencies = policyDeps.depends_on || [];
      this.dependencyGraph.set(policyName, dependencies);
    }
  }

  /**
   * List all available policies of a given category
   */
  listPoliciesByCategory(category) {
    const result = [];
    for (const [name, metadata] of this.policyRegistry) {
      if (metadata.category === category) {
        result.push({
          name,
          path: metadata.path,
          required: metadata.required,
        });
      }
    }
    return result;
  }

  /**
   * List all required policies that are missing
   */
  getMissingRequiredPolicies() {
    const missing = [];
    for (const [name, metadata] of this.policyRegistry) {
      if (!metadata.required) continue;
      const filePath = path.join(this.configsRoot, metadata.path);
      if (!fs.existsSync(filePath)) {
        missing.push({
          name,
          path: metadata.path,
          expected: filePath,
        });
      }
    }
    return missing;
  }

  /**
   * Get configuration statistics for audit/debugging
   */
  getStatistics() {
    return {
      repoRoot: this.repoRoot,
      platformRoot: this.platformRoot,
      configsRoot: this.configsRoot,
      totalPoliciesRegistered: this.policyRegistry.size,
      policiesLoaded: this.cache.size,
      categories: Array.from(
        new Set([...this.policyRegistry.values()].map((m) => m.category)),
      ),
    };
  }
}

/**
 * Export singleton instance creator for convenience
 */
export function createConfigManager(options) {
  return new ConfigManager(options);
}
