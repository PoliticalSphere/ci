#!/usr/bin/env node

/**
 * ==============================================================================
 * Political Sphere — ConfigManager Integration Example
 * ==============================================================================
 *
 * Purpose:
 *   Demonstrate practical integration of ConfigManager into existing workflows.
 *   This shows how to replace multiple policy loaders with the unified system.
 *
 * Usage:
 *   node tools/scripts/core/config-manager.integration-example.js
 *
 * ==============================================================================
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigManager } from './config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../');

/**
 * Example 1: Using ConfigManager in validate-ci Workflow
 *
 * This shows how to use ConfigManager to:
 * - Load all CI policies efficiently
 * - Validate them in dependency order
 * - Report comprehensive audit trail
 */
async function exampleValidateCIWorkflow() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ Example 1: Integrate ConfigManager into validate-ci        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const manager = new ConfigManager({ repoRoot });
  manager.initialize();

  console.log('📋 Loading CI policies in dependency order...\n');

  const ciPolicies = manager.listPoliciesByCategory('ci-governance');
  const policyMap = new Map();
  let validCount = 0;
  let failCount = 0;

  for (const policyMeta of ciPolicies) {
    if (!policyMeta.required) continue; // Only validate required policies for this example

    try {
      const policy = manager.getPolicy(policyMeta.name);
      if (!policy) {
        console.log(`  ⚠ ${policyMeta.name.padEnd(25)} (not found - skipped)`);
        continue;
      }

      policyMap.set(policyMeta.name, policy);

      const validation = manager.validateConfig(policyMeta.name, policy);
      if (validation.isValid) {
        console.log(`  ✓ ${policyMeta.name.padEnd(25)} (valid)`);
        validCount++;
      } else {
        console.log(`  ✗ ${policyMeta.name.padEnd(25)} (failed)`);
        for (const error of validation.errors) {
          console.log(`    → ${error}`);
        }
        failCount++;
      }
    } catch (err) {
      console.log(`  ✗ ${policyMeta.name.padEnd(25)} (error: ${err.message})`);
      failCount++;
    }
  }

  console.log(`\n✓ Validation complete: ${validCount} passed, ${failCount} failed\n`);
}

/**
 * Example 2: Using ConfigManager for Consumer Contract Validation
 *
 * Shows how to:
 * - Get all dependencies for consumer contract
 * - Validate in dependency order
 * - Track which policies feed into contract
 */
async function exampleConsumerContractValidation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ Example 2: Validate Consumer Contract with Dependencies    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const manager = new ConfigManager({ repoRoot });

  console.log('📊 Checking dependencies for consumer-contract...\n');

  try {
    const deps = manager.resolveDependencies('consumer-contract');
    console.log(`Found ${deps.length} policies required for contract:\n`);

    let validCount = 0;
    let failCount = 0;

    for (const depName of deps) {
      try {
        const policy = manager.getPolicy(depName);
        if (!policy) {
          console.log(`  ⚠ ${depName.padEnd(25)} (not found)`);
          continue;
        }

        const validation = manager.validateConfig(depName, policy);
        if (validation.isValid) {
          console.log(`  ✓ ${depName.padEnd(25)}`);
          validCount++;
        } else {
          console.log(`  ✗ ${depName.padEnd(25)}`);
          failCount++;
        }
      } catch (err) {
        console.log(`  ✗ ${depName.padEnd(25)} (${err.message})`);
        failCount++;
      }
    }

    console.log(`\n✓ Contract dependency check: ${validCount} passed, ${failCount} failed\n`);
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
  }
}

/**
 * Example 3: Audit Policy Changes with ConfigManager
 *
 * Demonstrates how to:
 * - Identify which policies have changed
 * - Find all dependent policies
 * - Impact analysis
 */
async function exampleImpactAnalysis() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ Example 3: Impact Analysis for Policy Changes             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const manager = new ConfigManager({ repoRoot });

  // Simulate changing a policy
  const changedPolicy = 'permissions-baseline';
  console.log(`📝 Analyzing impact of changes to: ${changedPolicy}\n`);

  // Find all policies that depend on this policy
  console.log('Policies that depend on this policy:');
  console.log('(requiring re-validation)\n');

  const allPolicies = [];
  for (const category of [
    'ci-governance',
    'lint',
    'security',
    'contracts',
  ]) {
    allPolicies.push(...manager.listPoliciesByCategory(category));
  }

  let impactCount = 0;
  for (const policyMeta of allPolicies) {
    try {
      const deps = manager.resolveDependencies(policyMeta.name);
      if (deps.includes(changedPolicy)) {
        console.log(`  ${policyMeta.name}`);
        impactCount++;
      }
    } catch (err) {
      // Skip on error
    }
  }

  console.log(
    `\n📊 Total policies affected: ${impactCount} (need re-validation)\n`,
  );
}

/**
 * Example 4: Configuration Discovery and Reporting
 *
 * Shows how to:
 * - Find all available policies
 * - Report their status
 * - Identify missing requirements
 */
async function exampleConfigurationReport() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ Example 4: Configuration Discovery & Reporting            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const manager = new ConfigManager({ repoRoot });
  manager.initialize();

  console.log('📋 Configuration Inventory Report\n');

  const stats = manager.getStatistics();
  console.log('Summary:');
  console.log(`  Total Policies: ${stats.totalPoliciesRegistered}`);
  console.log(`  Loaded: ${stats.policiesLoaded}`);
  console.log(`  Categories: ${stats.categories.length}`);
  console.log();

  for (const category of stats.categories) {
    const policies = manager.listPoliciesByCategory(category);
    const required = policies.filter((p) => p.required).length;
    const optional = policies.filter((p) => !p.required).length;

    console.log(`${category}:`);
    console.log(`  Total: ${policies.length} (${required} required, ${optional} optional)`);

    for (const policy of policies) {
      const status = policy.required ? '[REQ]' : '[OPT]';
      try {
        const p = manager.getPolicy(policy.name);
        const loaded = p ? '✓' : '○';
        console.log(`    ${loaded} ${policy.name.padEnd(20)} ${status}`);
      } catch (err) {
        console.log(`    ✗ ${policy.name.padEnd(20)} ${status}`);
      }
    }
  }

  console.log('\n📍 Missing Requirements:');
  const missing = manager.getMissingRequiredPolicies();
  if (missing.length === 0) {
    console.log('  ✓ All required policies present\n');
  } else {
    for (const policy of missing) {
      console.log(`  ${policy.name}`);
      console.log(`    Expected: ${policy.path}\n`);
    }
  }
}

/**
 * Example 5: Using ConfigManager in Custom Validation Logic
 *
 * Shows how to:
 * - Create custom validation rules
 * - Leverage ConfigManager for policy discovery
 * - Build domain-specific workflows
 */
async function exampleCustomValidation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║ Example 5: Custom Validation with ConfigManager           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const manager = new ConfigManager({ repoRoot });

  console.log('🔍 Custom Validation: "All Secrets Handling Compliant"\n');

  // Custom check: ensure secrets-handling policy is valid
  const policy = manager.getPolicy('secrets-handling');
  if (!policy) {
    console.log('⚠ Secrets handling policy not found\n');
    return;
  }

  const validation = manager.validateConfig('secrets-handling', policy);
  console.log(`Policy Status: ${validation.isValid ? '✓ VALID' : '✗ INVALID'}`);

  // Custom logic: check if dependent policies are also valid
  console.log('\nChecking dependent policies:');
  const deps = manager.resolveDependencies('secrets-handling');

  let allValid = validation.isValid;
  for (const dep of deps) {
    try {
      const depPolicy = manager.getPolicy(dep);
      if (depPolicy) {
        const depValidation = manager.validateConfig(dep, depPolicy);
        console.log(
          `  ${depValidation.isValid ? '✓' : '✗'} ${dep}`,
        );
        if (!depValidation.isValid) {
          allValid = false;
        }
      }
    } catch (err) {
      console.log(`  ✗ ${dep} (error: ${err.message})`);
      allValid = false;
    }
  }

  console.log(
    `\n✓ Custom validation complete: ${allValid ? 'ALL COMPLIANT' : 'ISSUES FOUND'}\n`,
  );
}

/**
 * Main execution
 */
async function main() {
  try {
    await exampleValidateCIWorkflow();
    await exampleConsumerContractValidation();
    await exampleImpactAnalysis();
    await exampleConfigurationReport();
    await exampleCustomValidation();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ All Examples Completed Successfully                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { exampleValidateCIWorkflow, exampleConsumerContractValidation };
