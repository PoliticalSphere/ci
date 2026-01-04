# Integration Tests

Multi-component tests that verify interactions between systems, workflows, and services.

## Purpose

Integration tests validate:
- Interactions between multiple components
- Real workflow execution and side effects
- Environment integration and configuration
- System-wide behavior and output

## Test Files

| File | Purpose |
|------|---------|
| `ps-tools.test.js` | Verify PS tools functionality |
| `ps-tools-wrappers.test.js` | Test PS tool wrapper scripts |
| `ps-write-summary.test.js` | Validate summary generation |
| `ps-run.logging.test.js` | Verify PS Run logging behavior |
| `ps-run.security.test.js` | Test PS Run security features |
| `scripts.test.js` | General script execution tests |
| `evasion-scan.test.js` | Evasion scanning integration |
| `egress.test.js` | Network egress policy validation |
| `lint-summary.test.js` | Core lint summary tests |
| `lint-summary-inline-disable.test.js` | Inline disable comment handling |
| `lint-summary-runid.test.js` | Run ID tracking in summaries |

## Running Integration Tests

```bash
# Run all integration tests
npm test -- integration/

# Run specific test
npm test -- integration/ps-run.logging.test.js

# Run with Node directly
node integration/ps-tools.test.js
```

## Key Characteristics

- ⏱️ **Slower**: Each test typically 500ms-5s (I/O bound)
- 📁 **Creates artifacts**: Temporary files, directories, logs
- 🔗 **Multi-component**: Tests real system interactions
- 🎯 **Workflow-focused**: Validates end-to-end behavior
- 📊 **Complex setup**: May require environment configuration

## Test Helpers

Import integration-specific utilities from `../helpers/`:

### From `test-helpers.js`:
```javascript
import { 
  fail, section, getRepoRoot, buildSafeEnv, readYamlFile 
} from '../helpers/test-helpers.js';
```

### From `ps-run-test-helpers.js`:
```javascript
import {
  buildPsRunEnv,           // Setup PS Run environment
  createPsRunWorkspace,    // Create temporary workspace
  createScript,            // Generate test scripts
  getPsRunHelper,          // Access PS Run helpers
  getLogPath,              // Locate generated logs
} from '../helpers/ps-run-test-helpers.js';
```

## Common Patterns

### Setting Up Workspace
```javascript
import { 
  createPsRunWorkspace, 
  createScript, 
  buildPsRunEnv 
} from '../helpers/ps-run-test-helpers.js';

const workspace = createPsRunWorkspace();
const scriptPath = createScript(workspace, 'test.sh', `
  #!/bin/bash
  echo "test"
`);

const env = buildPsRunEnv();
// Run test with workspace and env
```

### Verifying Logs
```javascript
import { getLogPath } from '../helpers/ps-run-test-helpers.js';

const logPath = getLogPath(workspace);
const logContents = fs.readFileSync(logPath, 'utf8');

if (!logContents.includes('expected output')) {
  fail('tests', 'Expected output not in logs');
}
```

### Testing Multiple Components
```javascript
section('integration', 'PS Run + Logging', 'Test PS Run with logging enabled');

try {
  // Component 1: Create workspace
  const workspace = createPsRunWorkspace();

  // Component 2: Generate script
  const script = createScript(workspace, 'test.sh', 'echo "test"');

  // Component 3: Run with environment
  const env = buildPsRunEnv();
  execFileSync('bash', [script], { env });

  // Component 4: Verify output
  const log = readLogFile(workspace);
  if (!log.includes('test')) {
    fail('integration', 'Output verification failed');
  }
} catch (error) {
  fail('integration', error.message);
}
```

### Temporary File Cleanup
```javascript
import { createPsRunWorkspace } from '../helpers/ps-run-test-helpers.js';

// Workspace is automatically created in temp directory
const workspace = createPsRunWorkspace();

// Files are in /tmp/ps-{random}/
// Automatically cleaned up after test or use:
// rm -rf ${workspace}
```

## Debugging

### Keep Temporary Files
```bash
# Keep workspace after test for inspection
KEEP_WORKSPACE=1 node integration/ps-run.logging.test.js
```

### Run with Debug Logging
```bash
# Enable verbose logging
DEBUG=* npm test -- integration/ps-run.logging.test.js
```

### Inspect Generated Logs
```bash
# Find workspace directory
find /tmp -name "ps-*" -type d -mmin -5

# View logs
cat /tmp/ps-{random}/logs/ps-run.log
```

### Check Test Output
```bash
# Capture all output
node integration/ps-tools.test.js 2>&1 | tee /tmp/test-output.log
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Temp files not cleaned | Check workspace cleanup in test |
| Permission denied | Ensure test directory is writable |
| Log file not found | Verify log path with `getLogPath()` |
| Timeout errors | Increase timeout or check subprocess |
| Environment not set | Use `buildPsRunEnv()` or `buildSafeEnv()` |

## Performance Optimization

- **Parallel Execution**: Tests don't share state
- **Workspace Isolation**: Each test gets own workspace
- **Fast Filesystem**: Use `/tmp` for temporary files
- **Lazy Loading**: Only import what you need

```bash
# Run subset for faster feedback
npm test -- integration/ps-run.logging.test.js
```

## Adding New Integration Tests

1. **Identify system interaction**:
   - Multiple components working together
   - Real workflow or use case
   - External systems involved

2. **Create test file**:
   ```bash
   touch integration/{component}.test.js
   ```

3. **Follow template**:
   ```javascript
   #!/usr/bin/env node

   import { createPsRunWorkspace } from '../helpers/ps-run-test-helpers.js';
   import { fail, section } from '../helpers/test-helpers.js';

   section('integration', 'Component Integration', 'Test interaction');

   try {
     const workspace = createPsRunWorkspace();
     // ... integration test logic ...
   } catch (error) {
     fail('integration', error.message);
   }
   ```

## CI Integration

Integration tests run in:
- CI pipelines (full test suite)
- Pre-merge validation
- Regression testing

Not run in pre-commit (too slow).

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for details.
