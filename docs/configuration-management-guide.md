# Configuration Management System

## Overview

The **Unified Configuration Manager** consolidates all configuration management across CI governance, linting, and security domains into a single, centralized system. This eliminates the fragmentation of policies scattered across `/configs/ci/policies/`, `/configs/lint/`, and `/configs/security/`.

### Key Benefits

- **Single Source of Truth**: All policies are registered and discoverable in one place
- **Dependency Tracking**: Automatic resolution of policy dependencies and circular dependency detection
- **Centralized Validation**: Unified validation logic with clear error messages
- **Performance**: Configuration caching to avoid repeated file I/O
- **Auditability**: Clear tracking of all configuration operations and relationships
- **Extensibility**: Easy to register new policies without modifying core code

---

## Architecture

### Components

#### 1. **ConfigManager** (`tools/scripts/core/config-manager.js`)

The core class that manages all configurations:

```javascript
import { ConfigManager } from './config-manager.js';

// Initialize the manager
const manager = new ConfigManager({
  repoRoot: '/path/to/repo',
  platformRoot: '/path/to/repo',
});

// Initialize and discover all policies
manager.initialize();

// Get a specific policy
const policy = manager.getPolicy('action-pinning');

// Validate a configuration
const validation = manager.validateConfig('action-pinning', policy);

// Resolve dependencies
const deps = manager.resolveDependencies('action-pinning');

// List policies by category
const ciPolicies = manager.listPoliciesByCategory('ci-governance');
```

**Key Methods:**

- `initialize()` - Discover all available policies
- `getPolicy(name)` - Load a policy by name (cached)
- `validateConfig(name, config)` - Validate a configuration
- `resolveDependencies(name)` - Get all dependencies for a policy
- `listPoliciesByCategory(category)` - List policies in a category
- `getMissingRequiredPolicies()` - Identify missing required configs
- `getStatistics()` - Get manager statistics for audit/debugging

#### 2. **Policy Dependencies Registry** (`configs/policy-dependencies.yml`)

Defines and documents relationships between policies:

```yaml
action-pinning:
  description: SHA-pinning requirements for remote GitHub Actions
  depends_on:
    - allowed-actions
    - naming-policy
  validated_by:
    - validate-ci
    - remote-sha-verify
  feeds_into:
    - validate-ci
    - consumer-contract
  tags: [security, ci-governance, supply-chain]
  risk_level: high
```

---

## Usage Patterns

### Pattern 1: Load and Validate a Policy

```javascript
const manager = new ConfigManager({ repoRoot });
manager.initialize();

const policy = manager.getPolicy('validate-ci');
const validation = manager.validateConfig('validate-ci', policy);

if (validation.isValid) {
  console.log('✓ Policy is valid');
} else {
  console.log('✗ Policy has errors:', validation.errors);
}
```

### Pattern 2: Resolve Policy Dependencies

```javascript
// Get all policies that must be validated before action-pinning
const requiredFirst = manager.resolveDependencies('action-pinning');

for (const dependency of requiredFirst) {
  const depPolicy = manager.getPolicy(dependency);
  const validation = manager.validateConfig(dependency, depPolicy);
  if (!validation.isValid) {
    throw new Error(`Dependency ${dependency} failed validation`);
  }
}
```

### Pattern 3: List and Validate Category

```javascript
const ciPolicies = manager.listPoliciesByCategory('ci-governance');

for (const policyMeta of ciPolicies) {
  const policy = manager.getPolicy(policyMeta.name);
  if (policy) {
    const validation = manager.validateConfig(policyMeta.name, policy);
    console.log(`${policyMeta.name}: ${validation.isValid ? 'PASS' : 'FAIL'}`);
  }
}
```

### Pattern 4: Audit Missing Configurations

```javascript
const missing = manager.getMissingRequiredPolicies();
if (missing.length > 0) {
  console.error('Missing required policies:');
  for (const policy of missing) {
    console.error(`  - ${policy.name}`);
    console.error(`    Expected at: ${policy.expected}`);
  }
}
```

---

## Policy Categories

### CI Governance

Core CI policies that define workflow safety, permissions, and action approval:

- `validate-ci` - Core validation rules
- `action-pinning` - SHA-pinning requirements
- `allowed-actions` - Approved action allowlist
- `permissions-baseline` - Least-privilege reference
- `high-risk-triggers` - High-risk trigger safeguards
- `secrets-handling` - Secrets hygiene expectations
- `unsafe-patterns` - Unsafe workflow pattern rules
- And more...

**Primary Validator**: `validate-ci` workflow

### Lint Configurations

Quality and style checks for code, documentation, and configurations:

- `eslint` - TypeScript/JavaScript linting
- `biome` - Formatting and correctness
- `yamllint` - YAML validation
- `actionlint` - GitHub Actions validation
- `shellcheck` - Shell script safety
- `markdownlint` - Markdown quality
- And more...

**Primary Validator**: `lint` workflow

### Security Configurations

Vulnerability scanning and compliance policies:

- `gitleaks` - Secret detection rules
- `license-policy` - OSS license compliance
- `trivy` - Vulnerability scanning
- `tooling-versions` - Pinned tool versions

**Primary Validator**: `security` workflow

---

## Registering New Policies

### Step 1: Add Policy File

Create your policy file in the appropriate directory:

```bash
# For CI policy:
configs/ci/policies/my-policy.yml

# For lint config:
configs/lint/my-linter.json

# For security config:
configs/security/my-security-check.yaml
```

### Step 2: Register in ConfigManager

Edit `tools/scripts/core/config-manager.js` and add to `_initializePolicyRegistry()`:

```javascript
registry.set('my-policy', {
  path: 'ci/policies/my-policy.yml',
  type: 'yaml',
  required: true,
  category: 'ci-governance',
});
```

### Step 3: Add Dependencies (if needed)

Edit `configs/policy-dependencies.yml`:

```yaml
my-policy:
  description: Description of the policy
  depends_on:
    - other-policy
  validated_by:
    - my-validator
  feeds_into:
    - consuming-policy
  tags: [tag1, tag2]
  risk_level: medium
```

### Step 4: Implement Validation (Optional)

Add validation logic to the appropriate `_validate*` method in ConfigManager:

```javascript
_validateCIPolicy(name, config) {
  const errors = [];
  
  if (name === 'my-policy') {
    if (!config.required_field) {
      errors.push("'my-policy' must have 'required_field'");
    }
  }
  
  return errors;
}
```

---

## Testing and Validation

### Run All Examples

```bash
node tools/scripts/core/config-manager.test.js
```

### Test Specific Policy

```bash
node tools/scripts/core/config-manager.test.js --policy action-pinning
```

### Validate All Policies

```bash
node tools/scripts/core/config-manager.test.js --validate-all
```

### Check Dependencies

```bash
node tools/scripts/core/config-manager.test.js --dependencies validate-ci
```

### Find Missing Configurations

```bash
node tools/scripts/core/config-manager.test.js --missing
```

---

## Integration Points

### With validate-ci

The `validate-ci` workflow can use ConfigManager to:

1. Discover all CI policies in order
2. Load and cache them once
3. Pass them to validation logic
4. Track dependencies for audit logs

Example integration:

```javascript
import { ConfigManager } from '../core/config-manager.js';

const manager = new ConfigManager({ repoRoot });
manager.initialize();

// Load all CI policies efficiently
const ciPolicies = manager.listPoliciesByCategory('ci-governance');
const loadedPolicies = new Map();

for (const policyMeta of ciPolicies) {
  const policy = manager.getPolicy(policyMeta.name);
  if (policy) {
    loadedPolicies.set(policyMeta.name, policy);
  }
}
```

### With Lint Workflow

The lint workflow can use ConfigManager to:

1. Verify all lint configurations exist
2. Validate configuration syntax
3. Ensure no missing or conflicting settings

### With Security Scanning

Security scanners can use ConfigManager to:

1. Load security policies in dependency order
2. Apply policies consistently across tools
3. Track which policies each finding relates to

---

## Performance Considerations

### Caching Strategy

- Configurations are loaded once and cached in memory
- Metadata tracks file paths, types, and timestamps
- Cache is automatically populated on first access

### Lazy Loading

- Policies are loaded on-demand, not all at initialization
- Optional policies that don't exist are gracefully skipped
- Initialize() discovers all policies but doesn't load them

### Circular Dependency Detection

The dependency resolver uses a visited set to detect cycles:

```javascript
try {
  const deps = manager.resolveDependencies('policy-a');
} catch (err) {
  // "Circular dependency detected: policy-a -> policy-b -> policy-a"
}
```

---

## File Format Support

The ConfigManager supports multiple configuration formats:

| Format | Type       | Parser          | Example Policies |
|--------|-----------|-----------------|-----------------|
| YAML   | yaml      | yaml library    | validate-ci, action-pinning |
| JSON   | json      | JSON.parse      | naming-policy, biome |
| JSONC  | jsonc     | Comment removal | markdownlint |
| ENV    | env       | Line parsing    | tooling.env |
| TOML   | toml      | Basic parser    | gitleaks.toml |
| Text   | text      | Raw content     | shellcheckrc |
| JS ESM | js-module | Direct import   | eslint.config.mjs |

---

## Error Handling

### Required Policy Missing

```javascript
try {
  const policy = manager.getPolicy('validate-ci');
} catch (err) {
  // "Required policy file not found: .../configs/ci/policies/validate-ci.yml"
}
```

### Validation Errors

```javascript
const validation = manager.validateConfig('policy-name', config);
if (!validation.isValid) {
  for (const error of validation.errors) {
    console.error(`Validation error: ${error}`);
  }
}
```

### Unknown Policy

```javascript
try {
  manager.getPolicy('nonexistent-policy');
} catch (err) {
  // "Unknown policy: nonexistent-policy"
}
```

---

## Best Practices

1. **Always Initialize** - Call `manager.initialize()` before using policies
2. **Validate After Load** - Use `validateConfig()` to ensure policy integrity
3. **Respect Dependencies** - Resolve dependencies before validating dependent policies
4. **Cache Manager Instances** - Create one ConfigManager per process, reuse it
5. **Document Changes** - Update `policy-dependencies.yml` when adding relationships
6. **Keep Policies Separate** - Don't mix concerns; each policy has one responsibility
7. **Use Categories** - Group related policies for bulk operations
8. **Audit Operations** - Use `getStatistics()` and metadata for change tracking

---

## Troubleshooting

### "Policy not found" Error

Check that:
1. Policy is registered in `_initializePolicyRegistry()`
2. File exists at the registered path
3. Path is relative to `configs/` directory

### Validation Failures

Run with detailed validation:

```bash
node tools/scripts/core/config-manager.test.js --policy policy-name
```

Check:
1. Policy file is valid YAML/JSON/format
2. Required fields are present
3. Values match expected types

### Circular Dependencies

Use the dependency resolver to find cycles:

```bash
node tools/scripts/core/config-manager.test.js --dependencies policy-name
```

Update `policy-dependencies.yml` to break the cycle.

---

## Migration Guide

For existing code using individual policy loaders:

### Before

```javascript
import { loadAllowlist } from './policies.js';
import yaml from 'yaml';
import fs from 'fs';

const allowlistPath = 'configs/ci/policies/allowed-actions.yml';
const content = fs.readFileSync(allowlistPath, 'utf8');
const policy = yaml.parse(content);
const allowlist = loadAllowlist(policy);
```

### After

```javascript
import { ConfigManager } from './config-manager.js';

const manager = new ConfigManager({ repoRoot });
const policy = manager.getPolicy('allowed-actions');
// Use policy directly, validation is automatic
```

---

## Related Documentation

- [CI Policy Governance](../../docs/ci-policy-governance.md)
- [Risk Decisions](../../docs/risk-decisions.md)
- [Integration Guide](../../docs/integration-guide.md)
- [Testing Strategy](../../docs/testing-strategy.md)
