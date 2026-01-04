# Safety Tests

Security and validation checks ensuring secure coding practices, policy compliance, and safe operations.

## Purpose

Safety tests validate:
- Input sanitization and validation
- Security policy enforcement
- Safe variable interpolation
- Secure script execution
- Data protection practices

## Test Files

| File | Purpose |
|------|---------|
| `action-input-safety.test.js` | Verify action input handling is secure |
| `action-run-safety.test.js` | Ensure run blocks don't interpolate inputs directly |
| `script-safety.test.js` | Validate script security practices |
| `consumer-contract.run-safety.test.js` | Consumer contract run-block safety |

## Running Safety Tests

```bash
# Run all safety tests
npm test -- safety/

# Run specific test
npm test -- safety/action-input-safety.test.js

# Run with Node directly
node safety/action-run-safety.test.js
```

## Key Characteristics

- 🔒 **Security-Focused**: Enforce safe coding practices
- ✅ **Policy Enforcement**: Validate governance rules
- 🛡️ **Input Protection**: Prevent injection attacks
- ⚡ **Fast Execution**: ~200ms per test
- 🎯 **Focused Scope**: Single security concern per test

## Test Helpers

Import safety-specific utilities from `../helpers/`:

### From `action-safety-test-helpers.js`:
```javascript
import {
  listActionYmls,   // Find all action.yml files
  scanRunBlocks,    // Analyze run blocks for issues
} from '../helpers/action-safety-test-helpers.js';
```

### From `test-helpers.js`:
```javascript
import { 
  fail, section, getRepoRoot 
} from '../helpers/test-helpers.js';
```

## Common Patterns

### Scanning Action Files
```javascript
import { listActionYmls, scanRunBlocks } from '../helpers/action-safety-test-helpers.js';
import { fail, section, getRepoRoot } from '../helpers/test-helpers.js';

const repoRoot = getRepoRoot();
section('safety', 'Action Input Safety', `Root: ${repoRoot}`);

try {
  const { files } = listActionYmls(repoRoot);
  const { unsafe } = scanRunBlocks(files);

  if (unsafe.length > 0) {
    fail('safety', `Found unsafe run blocks: ${unsafe.join(', ')}`);
  }
} catch (error) {
  fail('safety', error.message);
}
```

### Validating Input Handling
```javascript
// Check for direct variable interpolation
// ✗ UNSAFE: run: echo ${{ inputs.user }}
// ✓ SAFE: run: echo "${INPUT_USER}"

const unsafePattern = /\$\{\{\s*inputs\./;
if (fileContent.match(unsafePattern)) {
  fail('safety', 'Direct input interpolation found - use env variables instead');
}
```

### Security Policy Compliance
```javascript
// Verify all scripts follow security policy
const policyViolations = [];

for (const script of scripts) {
  if (!hasSecurityHeaders(script)) {
    policyViolations.push(script);
  }
}

if (policyViolations.length > 0) {
  fail('safety', `Policy violations in: ${policyViolations.join(', ')}`);
}
```

## Security Rules

### Input Interpolation Rule
**Never** directly interpolate action inputs in run blocks:

```yaml
# ✗ UNSAFE
run: |
  echo ${{ inputs.username }}
  set "${{ inputs.value }}"

# ✓ SAFE
run: |
  echo "$INPUT_USERNAME"
  set "$INPUT_VALUE"
```

**Why**: Direct interpolation allows argument injection attacks.

### Script Execution Rule
**Always** validate scripts before execution:
```bash
# ✓ GOOD: Validate before running
bash -n script.sh && bash script.sh

# ✗ BAD: Run without validation
bash script.sh
```

### Environment Variables Rule
**Use** safe environment variables for sensitive data:
```bash
# ✓ GOOD: Use safe env vars
export SAFE_API_KEY="${INPUT_API_KEY}"

# ✗ BAD: Direct input reference
export API_KEY=${{ inputs.api_key }}
```

## Adding New Safety Tests

1. **Identify security concern**:
   - Input validation issue
   - Policy violation pattern
   - Attack vector or vulnerability

2. **Create test file**:
   ```bash
   touch safety/{concern}-safety.test.js
   ```

3. **Follow template**:
   ```javascript
   #!/usr/bin/env node

   import { listActionYmls, scanRunBlocks } from '../helpers/action-safety-test-helpers.js';
   import { fail, section, getRepoRoot } from '../helpers/test-helpers.js';

   const repoRoot = getRepoRoot();
   section('safety', 'Security Concern', 'Description');

   try {
     // Scan files
     const { files } = listActionYmls(repoRoot);
     const violations = files.filter(file => {
       // Check for security issue
       return hasSecurityIssue(file);
     });

     if (violations.length > 0) {
       fail('safety', `Found ${violations.length} violations`);
     }
   } catch (error) {
     fail('safety', error.message);
   }
   ```

## Debugging

### Find Security Issues
```bash
# Scan for specific pattern
grep -r '\${{ inputs\.' . --include="*.yml" --include="*.yaml"

# List all run blocks
grep -A5 'run:' action.yml
```

### Verify Fixes
```bash
# Run specific test
node safety/action-input-safety.test.js

# Run all safety tests
npm test -- safety/
```

## Common Issues

| Issue | Solution |
|-------|----------|
| False positives | Refine pattern matching |
| Missed violations | Add more test cases |
| Fragile assertions | Use robust pattern detection |
| Hard to debug | Add detailed error messages |

## Security Policy Integration

Safety tests enforce:
- **Policy**: Input validation requirements
- **Standards**: Secure coding practices
- **Governance**: Security policy compliance
- **Audit**: Trackable security checks

See [docs/security-ci-policy.md](../../../docs/security-ci-policy.md) for policy details.

## CI Integration

Safety tests run in:
- Pre-commit hooks (early detection)
- CI pipelines (comprehensive validation)
- Security audit scans
- Policy compliance checks

Run with higher priority than other tests.

## Resources

- [Input Validation Guide](../../../docs/validate-inputs-consolidation.md)
- [AI Governance](../../../docs/ai-governance.md)
- [Security Enhancements](../../../docs/security-enhancements-implementation.md)
- [SECURITY.md](../../../SECURITY.md)
