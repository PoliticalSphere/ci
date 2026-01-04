# Unit Tests

Single-function and single-module tests that verify individual components in isolation.

## Purpose

Unit tests provide fast, deterministic validation of:
- Individual functions and modules
- Edge cases and error conditions
- Input validation and sanitization
- Core utilities and helpers

## Test Files

| File | Purpose |
|------|---------|
| `bash-syntax.test.js` | Verify shell scripts have no syntax errors using `bash -n` |
| `license-check.test.js` | Validate license headers in source files |
| `regex-safety.test.js` | Test regex patterns for safety and correctness |
| `validate-inputs-common.test.js` | Validate input parameter handling |
| `validate-ci.unit.test.js` | Unit tests for CI validation logic |
| `validate-ci.e2e.test.js` | End-to-end validation tests |
| `validate-ci.remote.test.js` | Remote verification tests |
| `config-manager.test.js.skip` | Config manager tests (currently skipped) |

## Running Unit Tests

```bash
# Run all unit tests
npm test -- unit/

# Run specific test
npm test -- unit/bash-syntax.test.js

# Run with Node directly
node unit/bash-syntax.test.js
```

## Key Characteristics

- ✅ **Fast**: Each test typically < 500ms
- ✅ **Isolated**: No external dependencies or side effects
- ✅ **Deterministic**: Same results every run
- ✅ **Comprehensive**: Cover normal cases, edge cases, errors
- ✅ **Independent**: Can run in any order

## Test Helpers

Import common utilities from `../helpers/test-helpers.js`:

```javascript
import { fail, section, getRepoRoot, mktemp } from '../helpers/test-helpers.js';
```

Available functions:
- `fail(section, message)` - Report test failure
- `section(name, title, detail)` - Log test section
- `info(message)` - Log informational message
- `getRepoRoot()` - Get repository root
- `mktemp()` - Create temporary directory
- `readYamlFile(path)` - Parse YAML
- `SAFE_PATH` - Safe environment variable

## Adding New Unit Tests

1. **Identify testable unit**:
   - Single function or module
   - Can be tested without external systems
   - Has clear success/failure criteria

2. **Create test file**:
   ```bash
   touch unit/{module}.test.js
   ```

3. **Follow template**:
   ```javascript
   #!/usr/bin/env node

   import { fail, section } from '../helpers/test-helpers.js';

   section('tests', 'Module Tests', 'Description');

   try {
     // Run test logic
     if (!expectedCondition) {
       fail('tests', 'Test description failed');
     }
   } catch (error) {
     fail('tests', error.message);
   }
   ```

## Common Patterns

### Testing Functions
```javascript
import { moduleFunction } from '../../path/to/module.js';

try {
  const result = moduleFunction(input);
  if (result !== expectedValue) {
    fail('tests', `Expected ${expectedValue}, got ${result}`);
  }
} catch (error) {
  fail('tests', `Function threw: ${error.message}`);
}
```

### Testing Edge Cases
```javascript
// Test null/undefined
if (moduleFunction(null) !== expectedBehavior) {
  fail('tests', 'Failed on null input');
}

// Test empty values
if (moduleFunction('') !== expectedBehavior) {
  fail('tests', 'Failed on empty string');
}

// Test large values
if (moduleFunction(largeInput) !== expectedBehavior) {
  fail('tests', 'Failed on large input');
}
```

### Temporary Files
```javascript
import { mktemp } from '../helpers/test-helpers.js';

const tmpDir = mktemp();
// Use tmpDir for test files
// Automatically cleaned up
```

## Debugging

### Run Single Test with Verbose Output
```bash
node --inspect-brk unit/bash-syntax.test.js
```

### Check Assertions
Each test should log clear success/failure messages:
```javascript
console.log('✓ Assertion passed');
fail('tests', '✗ Assertion failed - reason');
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Import not found | Check relative path, ensure file exists |
| Function undefined | Verify export in source module |
| Temporary files not cleaned | Use `mktemp()` helper |
| Syntax error in test | Use `node --check unit/test.js` |

## Performance

- Target: < 100ms per test
- Avoid I/O operations
- Use mocking for external calls
- Focus on fast feedback

## CI Integration

Unit tests run in:
- Pre-commit hooks (fast path)
- CI pipelines (comprehensive validation)
- Local development (`npm test`)

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for details.
