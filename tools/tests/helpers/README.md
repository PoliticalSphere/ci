# Test Helpers

Shared testing utilities and fixtures used across unit, integration, safety, and contract tests.

## Purpose

Test helpers provide:
- Common testing functions and assertions
- Environment setup and teardown
- File I/O and parsing utilities
- Test data builders and factories
- Consistent error reporting

## Helper Files

### `test-helpers.js`
Core testing utilities used by all test categories.

**Core Assertion Functions:**
- `fail(section, message)` - Report and fail test
- `section(name, title, detail)` - Log test section header
- `info(message)` - Log informational message
- `detail(key, value)` - Log detailed information

**Environment & Path Functions:**
- `getRepoRoot()` - Get repository root directory
- `getPlatformRoot()` - Get platform root
- `getSafePath()` - Get safe PATH environment variable
- `SAFE_PATH` - Constant for safe environment variable

**File & Directory Functions:**
- `mktemp()` - Create temporary directory
- `readYamlFile(filePath)` - Parse YAML files
- `readJsonFile(filePath)` - Parse JSON files
- `getTestDataPath()` - Get test data directory

**Environment Functions:**
- `buildSafeEnv()` - Create isolated test environment
- `isCI()` - Check if running in CI environment
- `isLocal()` - Check if running locally

**Utility Functions:**
- `isObject(value)` - Type validation for objects
- `fail(section, message)` - Report test failure and exit

**Example Usage:**
```javascript
import { 
  fail, 
  section, 
  getRepoRoot, 
  mktemp, 
  readYamlFile, 
  buildSafeEnv 
} from '../helpers/test-helpers.js';

const repoRoot = getRepoRoot();
section('tests', 'Test Suite', 'Running comprehensive tests');

const tmpDir = mktemp();
const config = readYamlFile('./config.yml');
const env = buildSafeEnv();

if (!config.enabled) {
  fail('tests', 'Configuration not enabled');
}
```

### `ps-run-test-helpers.js`
PS Run-specific utilities for workflow and script testing.

**Workspace & Setup Functions:**
- `buildPsRunEnv()` - Setup PS Run environment
- `createPsRunWorkspace()` - Create isolated workspace
- `createScript(workspace, filename, content)` - Generate test scripts
- `getPsRunHelper()` - Access PS Run helper functions

**Utility Functions:**
- `getLogPath(workspace)` - Get location of test logs
- `readLogFile(workspace)` - Read PS Run logs
- `getWorkspacePath(workspace)` - Get workspace directory path

**Example Usage:**
```javascript
import {
  buildPsRunEnv,
  createPsRunWorkspace,
  createScript,
  getLogPath,
} from '../helpers/ps-run-test-helpers.js';
import { execFileSync } from 'node:child_process';

const env = buildPsRunEnv();
const workspace = createPsRunWorkspace();
const scriptPath = createScript(workspace, 'test.sh', `
  #!/bin/bash
  echo "test output"
`);

execFileSync('bash', [scriptPath], { env });

const logPath = getLogPath(workspace);
const logs = fs.readFileSync(logPath, 'utf8');
console.log(logs);
```

### `action-safety-test-helpers.js`
Action security scanning utilities.

**File Discovery Functions:**
- `listActionYmls(repoRoot)` - Find all action.yml files
- `listActionYmlsByPattern(pattern)` - Find actions matching pattern
- `getActionsRoot(repoRoot)` - Get actions directory path

**Security Scanning Functions:**
- `scanRunBlocks(files)` - Analyze run blocks for security issues
- `scanInputInterpolation(files)` - Check for unsafe input usage
- `scanActionMetadata(files)` - Validate action structure

**Example Usage:**
```javascript
import { 
  listActionYmls, 
  scanRunBlocks 
} from '../helpers/action-safety-test-helpers.js';

const repoRoot = getRepoRoot();
const { actionsRoot, files } = listActionYmls(repoRoot);
const { safe, unsafe } = scanRunBlocks(files);

console.log(`Safe actions: ${safe.length}`);
console.log(`Unsafe actions: ${unsafe.join(', ')}`);
```

## Function Reference

### `test-helpers.js`

```javascript
// Assertion/Reporting
fail(section, message) → void
section(name, title, detail) → void
info(message) → void
detail(key, value) → void

// Paths & Environment
getRepoRoot() → string
getPlatformRoot() → string
getSafePath() → string
mktemp() → string

// File I/O
readYamlFile(filePath) → object
readJsonFile(filePath) → object

// Utilities
buildSafeEnv() → object
isCI() → boolean
isLocal() → boolean
isObject(value) → boolean
```

### `ps-run-test-helpers.js`

```javascript
// Setup & Workspace
buildPsRunEnv() → object
createPsRunWorkspace() → string
createScript(workspace, filename, content) → string
getPsRunHelper() → object

// Utilities
getLogPath(workspace) → string
readLogFile(workspace) → string
getWorkspacePath(workspace) → string
```

### `action-safety-test-helpers.js`

```javascript
// Discovery
listActionYmls(repoRoot) → { actionsRoot, files }
listActionYmlsByPattern(pattern) → string[]
getActionsRoot(repoRoot) → string

// Scanning
scanRunBlocks(files) → { safe, unsafe }
scanInputInterpolation(files) → violation[]
scanActionMetadata(files) → metadata[]
```

## Common Test Patterns

### Unit Test with Helpers
```javascript
#!/usr/bin/env node
import { fail, section } from '../helpers/test-helpers.js';

section('tests', 'Module Tests', 'Testing module functionality');

try {
  // Test logic
  if (!expectedCondition) {
    fail('tests', 'Assertion failed');
  }
  console.log('✓ Test passed');
} catch (error) {
  fail('tests', error.message);
}
```

### Integration Test with Workspace
```javascript
#!/usr/bin/env node
import { createPsRunWorkspace, getLogPath } from '../helpers/ps-run-test-helpers.js';
import { fail, section } from '../helpers/test-helpers.js';

section('integration', 'Workflow Test', 'Testing full workflow');

try {
  const workspace = createPsRunWorkspace();
  // Run integration test
  const logPath = getLogPath(workspace);
  // Verify results
} catch (error) {
  fail('integration', error.message);
}
```

### Safety Test with Scanning
```javascript
#!/usr/bin/env node
import { listActionYmls, scanRunBlocks } from '../helpers/action-safety-test-helpers.js';
import { fail, section, getRepoRoot } from '../helpers/test-helpers.js';

const repoRoot = getRepoRoot();
section('safety', 'Action Safety', `Scanning: ${repoRoot}`);

try {
  const { files } = listActionYmls(repoRoot);
  const { unsafe } = scanRunBlocks(files);
  
  if (unsafe.length > 0) {
    fail('safety', `Unsafe blocks: ${unsafe.join(', ')}`);
  }
} catch (error) {
  fail('safety', error.message);
}
```

## Test Data & Fixtures

### Using Temporary Directories
```javascript
import { mktemp } from '../helpers/test-helpers.js';
import fs from 'node:fs';

const tmpDir = mktemp();
const testFile = `${tmpDir}/test.txt`;
fs.writeFileSync(testFile, 'test content');

// Use testFile in tests
// Automatically cleaned up after test
```

### Reading Configuration
```javascript
import { readYamlFile, getRepoRoot } from '../helpers/test-helpers.js';

const repoRoot = getRepoRoot();
const config = readYamlFile(`${repoRoot}/config.yml`);
const policy = readYamlFile(`${repoRoot}/configs/policy.yml`);
```

### Building Test Environment
```javascript
import { buildSafeEnv, buildPsRunEnv } from '../helpers/test-helpers.js';

// Create isolated environment
const safeEnv = buildSafeEnv();
const psRunEnv = buildPsRunEnv();

// Use in subprocess
execFileSync('bash', [script], { env: safeEnv });
```

## Adding New Helper Functions

### When to Create a Helper
- ✅ Used in multiple test files
- ✅ Encapsulates complex setup/teardown
- ✅ Reduces test code duplication
- ✅ Provides consistent interface

### Template for New Helper

```javascript
/**
 * Brief description of what helper does
 * 
 * @param {type} param1 - Parameter description
 * @param {type} param2 - Parameter description
 * @returns {type} Return value description
 * @throws {Error} When validation fails
 * 
 * @example
 * const result = helperFunction(value);
 * console.log(result);
 */
export function helperFunction(param1, param2) {
  // Validate inputs
  if (!param1) {
    throw new Error('param1 is required');
  }

  // Perform helper logic
  const result = performLogic(param1, param2);

  // Return result
  return result;
}
```

### Placement Guidelines
- **Common utility** → `test-helpers.js`
- **PS Run specific** → `ps-run-test-helpers.js`
- **Action scanning** → `action-safety-test-helpers.js`
- **Reusable pattern** → Consider new helper file

## Performance Optimization

### Lazy Imports
```javascript
// ✓ GOOD: Import only what you need
import { fail, section } from '../helpers/test-helpers.js';

// ✗ AVOID: Import all helpers
import * as helpers from '../helpers/test-helpers.js';
```

### Workspace Reuse
```javascript
// ✓ GOOD: Share workspace across related tests
const workspace = createPsRunWorkspace();
// run multiple tests with same workspace

// ✗ AVOID: Create workspace for each assertion
for (const test of tests) {
  const workspace = createPsRunWorkspace(); // inefficient
}
```

### Batch Operations
```javascript
// ✓ GOOD: Batch file operations
const files = listActionYmls(repoRoot);
const violations = scanRunBlocks(files);

// ✗ AVOID: Individual file operations
for (const file of allFiles) {
  const result = scanFile(file); // inefficient
}
```

## Error Handling

### Using `fail()` for Errors
```javascript
import { fail } from '../helpers/test-helpers.js';

try {
  const result = riskyOperation();
} catch (error) {
  fail('tests', `Operation failed: ${error.message}`);
}
```

### Validation Errors
```javascript
if (!value) {
  fail('tests', 'Value is required');
}

if (typeof value !== 'string') {
  fail('tests', `Expected string, got ${typeof value}`);
}
```

## Debugging Helpers

### Enable Verbose Logging
```bash
DEBUG=* npm test
```

### Check Helper Behavior
```bash
# Run simple test with helper
node -e "
import { getRepoRoot } from './helpers/test-helpers.js';
console.log('Root:', getRepoRoot());
"
```

### Inspect Temporary Files
```bash
# Keep workspace after test
KEEP_WORKSPACE=1 npm test -- integration/test.js

# Check workspace contents
ls -la /tmp/ps-*/
```

## Resources

- [Test Suite Overview](./README.md)
- [Unit Tests](./unit/README.md)
- [Integration Tests](./integration/README.md)
- [Safety Tests](./safety/README.md)
- [Contract Tests](./contracts/README.md)
