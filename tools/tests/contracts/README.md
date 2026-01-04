# Contract Tests

Deterministic compliance tests ensuring metadata existence, parseability, and platform standards.

## Purpose

Contract tests validate:
- Metadata structure and validity
- Policy compliance and requirements
- Platform standard conformance
- Deterministic, reproducible validation
- Deployment readiness

## Test Files

| File | Purpose |
|------|---------|
| `actions.test.js` | Composite action metadata validation |
| `consumer-contract.test.js` | Consumer contract compliance |

## Running Contract Tests

```bash
# Run all contract tests
npm test -- contracts/

# Run specific test
npm test -- contracts/actions.test.js

# Run with Node directly
node contracts/actions.test.js
```

## Key Characteristics

- ✅ **Deterministic**: Same results every run
- 📋 **Policy-Based**: Enforce specific requirements
- 🎯 **Reproducible**: Clear pass/fail criteria
- 🔍 **Comprehensive**: Validate entire metadata
- 📊 **Trackable**: Audit trail of compliance

## Test Helpers

Import compliance utilities from `../helpers/test-helpers.js`:

```javascript
import { 
  fail, 
  section, 
  getRepoRoot,
  isCI,
  isObject,
  readYamlFile,
  detail,
  info,
} from '../helpers/test-helpers.js';
```

Available functions:
- `fail(section, message)` - Report compliance failure
- `section(name, title, detail)` - Log test section
- `readYamlFile(path)` - Parse YAML metadata
- `isCI()` - Check if running in CI
- `isObject(value)` - Type validation
- `detail(key, value)` - Log compliance detail
- `info(message)` - Log information

## Common Patterns

### Validating Action Metadata
```javascript
import { readYamlFile, fail, section } from '../helpers/test-helpers.js';

const action = readYamlFile('action.yml');

// Check required fields
const requiredFields = ['name', 'description', 'runs'];
for (const field of requiredFields) {
  if (!action[field]) {
    fail('contracts', `Missing required field: ${field}`);
  }
}

// Validate runs configuration
if (!action.runs.using || !action.runs.main) {
  fail('contracts', 'Invalid runs configuration');
}
```

### Metadata Parseability
```javascript
try {
  const metadata = readYamlFile(filePath);
  
  // Verify structure is valid
  if (!isObject(metadata)) {
    fail('contracts', `Invalid metadata structure: ${filePath}`);
  }

  // Verify required nested objects
  if (!isObject(metadata.runs)) {
    fail('contracts', `Runs configuration invalid: ${filePath}`);
  }
} catch (error) {
  fail('contracts', `Parse error in ${filePath}: ${error.message}`);
}
```

### Policy Compliance Check
```javascript
section('contracts', 'Action Policy Compliance', 'Verifying actions meet policy');

const { actionsRoot, files } = listActionYmls(repoRoot);
const violations = [];

for (const file of files) {
  const action = readYamlFile(file);

  // Policy: Name must be non-empty
  if (!action.name || action.name.trim() === '') {
    violations.push(`${file}: Empty name`);
  }

  // Policy: Description required
  if (!action.description) {
    violations.push(`${file}: Missing description`);
  }

  // Policy: Author attribution required
  if (!action.author) {
    violations.push(`${file}: Missing author`);
  }
}

if (violations.length > 0) {
  fail('contracts', `Policy violations:\n${violations.join('\n')}`);
}
```

### Consumer Contract Validation
```javascript
import { readYamlFile, detail } from '../helpers/test-helpers.js';

section('contracts', 'Consumer Contract', 'Verifying consumer expectations');

const contract = readYamlFile('consumer-contract.json');

detail('version', contract.version);
detail('actions', contract.actions.length);
detail('requirements', contract.requirements.length);

// Validate contract structure
const expectedProps = ['version', 'actions', 'requirements'];
for (const prop of expectedProps) {
  if (!(prop in contract)) {
    fail('contracts', `Contract missing: ${prop}`);
  }
}
```

## Policy Rules

### Action Metadata Requirements
**All actions must have:**
- ✅ `name` - Non-empty string identifying the action
- ✅ `description` - Human-readable purpose
- ✅ `author` - Creator/maintainer attribution
- ✅ `runs` - Execution configuration
  - ✅ `using` - Runtime (e.g., "composite")
  - ✅ `main` - Entry point script

### Consumer Contract Requirements
**Consumer contracts must specify:**
- ✅ `version` - Semantic version (e.g., "1.0.0")
- ✅ `actions` - Array of required actions
- ✅ `requirements` - Array of compliance requirements
- ✅ `compliance` - Policy compliance metadata

### Metadata Parseability
**All metadata files must:**
- ✅ Parse without errors
- ✅ Contain required field types
- ✅ Have valid structure
- ✅ Meet schema requirements

## CI Behavior

Contract tests have different behavior in CI vs. local development:

### In CI (Production)
- ✅ Failure: Absence of expected actions = fail
- ✅ Enforced: All policy requirements
- ✅ Strict: No exceptions allowed

### Locally (Bootstrap)
- ⚠️ Warning: Missing actions directory exits cleanly
- ℹ️ Guidance: Provides setup instructions
- 🤝 Permissive: Allows workflow setup

```javascript
import { isCI } from '../helpers/test-helpers.js';

if (!fs.existsSync(actionsDir)) {
  if (isCI()) {
    fail('contracts', 'Actions directory missing in CI');
  } else {
    info('Local setup: Actions directory not found - guidance provided');
    process.exit(0);
  }
}
```

## Adding New Contract Tests

1. **Identify compliance requirement**:
   - Metadata structure
   - Policy rule
   - Standard requirement

2. **Create test file**:
   ```bash
   touch contracts/{component}-contract.test.js
   ```

3. **Follow template**:
   ```javascript
   #!/usr/bin/env node

   import { readYamlFile, fail, section, detail, isCI } from '../helpers/test-helpers.js';
   import { getRepoRoot } from '../helpers/test-helpers.js';

   const repoRoot = getRepoRoot();
   section('contracts', 'Component Contract', 'Verifying compliance');

   try {
     // Load metadata
     const metadata = readYamlFile(contractPath);

     // Validate required fields
     const required = ['field1', 'field2'];
     for (const field of required) {
       if (!metadata[field]) {
         fail('contracts', `Missing required field: ${field}`);
       }
     }

     // Log details
     detail('status', 'valid');
   } catch (error) {
     fail('contracts', error.message);
   }
   ```

## Debugging

### Validate Metadata Directly
```bash
# Parse action.yml
node -e "console.log(require('js-yaml').load(require('fs').readFileSync('action.yml')))"

# Validate structure
node contracts/actions.test.js
```

### Check Policy Requirements
```bash
# Run contract tests
npm test -- contracts/

# Focus on single component
npm test -- contracts/actions.test.js
```

### Document Contract Requirements
```bash
# Generate compliance report
node contracts/actions.test.js | grep -E "Policy|Required|Missing"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Parse error | Check YAML syntax, ensure valid structure |
| Missing field | Add required field to metadata |
| Type mismatch | Verify field type matches requirement |
| CI vs local | Use `isCI()` for conditional logic |
| False positives | Refine validation rules |

## Audit and Compliance

Contract tests provide:
- 📋 **Audit Trail**: Track compliance checks
- ✅ **Verification**: Deterministic validation
- 📊 **Reporting**: Clear pass/fail status
- 🔍 **Traceability**: Link to policy requirements

See [docs/ci-policy-governance.md](../../../docs/ci-policy-governance.md) for policy details.

## CI Integration

Contract tests run in:
- CI pipelines (pre-deployment validation)
- Merge validation (ensure compliance)
- Release verification (deployment readiness)
- Audit checks (policy enforcement)

These are **blocking** tests - failures prevent deployment.

## Resources

- [Policy Governance](../../../docs/ci-policy-governance.md)
- [Configuration Management](../../../docs/configuration-management-guide.md)
- [Consumer Contract](../../../configs/consumer/contract.json)
- [Policy Dependencies](../../../configs/policy-dependencies.yml)
