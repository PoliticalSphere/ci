# Political Sphere — Test Suite

Comprehensive test suite organized by semantic concerns: unit tests, integration tests, safety/security tests, and compliance/contract tests.

## Directory Structure

```
tests/
├── helpers/                    # Shared testing utilities and fixtures
│   ├── test-helpers.js         # Core test utilities (setup, assertion, environment)
│   ├── action-safety-test-helpers.js
│   └── ps-run-test-helpers.js
├── unit/                       # Single function/module unit tests
│   ├── README.md               # Unit test documentation
│   ├── bash-syntax.test.js     # Shell script syntax validation
│   ├── license-check.test.js   # License header verification
│   ├── regex-safety.test.js    # Regex pattern validation
│   ├── validate-inputs-common.test.js
│   ├── validate-ci.unit.test.js
│   ├── validate-ci.e2e.test.js
│   └── validate-ci.remote.test.js
├── integration/                # Multi-component/system integration tests
│   ├── README.md               # Integration test documentation
│   ├── ps-tools.test.js
│   ├── ps-tools-wrappers.test.js
│   ├── ps-write-summary.test.js
│   ├── ps-run.logging.test.js
│   ├── ps-run.security.test.js
│   ├── scripts.test.js
│   ├── evasion-scan.test.js
│   ├── egress.test.js
│   └── lint-summary*.test.js
├── safety/                     # Security/validation checks
│   ├── README.md               # Safety test documentation
│   ├── action-input-safety.test.js
│   ├── action-run-safety.test.js
│   ├── script-safety.test.js
│   └── consumer-contract.run-safety.test.js
├── contracts/                  # Compliance/contract validation tests
│   ├── README.md               # Contract test documentation
│   ├── consumer-contract.test.js
│   └── actions.test.js
├── validate-ci/                # Specialized CI validation tests
│   └── remote-verify.test.js   # Remote SHA verification
└── README.md                   # This file
```

## Test Categories

### Unit Tests (`unit/`)
Single-function or single-module tests that verify individual components in isolation.

**Examples:**
- Bash syntax validation
- License header checks
- Regex pattern validation
- Input validation

**Key Characteristics:**
- Fast execution
- No external dependencies (isolated)
- High coverage of edge cases
- Deterministic results

### Integration Tests (`integration/`)
Multi-component tests that verify interactions between systems and workflows.

**Examples:**
- PS Run (logging, security)
- PS Tools functionality
- Summary writing
- Lint report generation
- Evasion scan integration
- Egress policy checks

**Key Characteristics:**
- Slower than unit tests
- May create temporary files/directories
- Test real workflows and interactions
- Environment-dependent

### Safety Tests (`safety/`)
Security and validation checks ensuring secure coding practices and policy compliance.

**Examples:**
- Action input safety (no direct variable interpolation)
- Action run-block input validation
- Script safety checks
- Consumer contract run-safety

**Key Characteristics:**
- Security-focused assertions
- Policy enforcement validation
- Input/output sanitization checks
- Governance compliance

### Contract Tests (`contracts/`)
Deterministic compliance tests ensuring metadata existence, parseability, and platform standards.

**Examples:**
- Composite action metadata validation
- Consumer contract verification

**Key Characteristics:**
- Policy-based validation
- Deterministic/reproducible
- Metadata compliance checks
- Platform standard enforcement

### Specialized Tests (`validate-ci/`)
CI validation tests with specialized concerns (remote verification, etc.).

**Key Characteristics:**
- Focused CI/validation logic
- Remote or distributed verification
- Specialized test infrastructure

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Categories
```bash
# Unit tests
npm test -- unit/

# Integration tests
npm test -- integration/

# Safety tests
npm test -- safety/

# Contract tests
npm test -- contracts/
```

### Run Individual Test Files
```bash
npm test -- unit/bash-syntax.test.js
npm test -- integration/ps-run.logging.test.js
```

### Run with Node Directly
```bash
node unit/bash-syntax.test.js
node integration/ps-tools.test.js
```

## Test Helpers

Shared testing utilities are located in `helpers/`:

### `test-helpers.js`
Core testing utilities:
- `getRepoRoot()` - Get repository root directory
- `fail(section, message)` - Report test failure
- `section(name, title, detail)` - Log test section
- `buildSafeEnv()` - Create isolated test environment
- `readYamlFile(filePath)` - Parse YAML files
- `mktemp()` - Create temporary directories
- and more...

### `ps-run-test-helpers.js`
PS Run-specific utilities:
- `buildPsRunEnv()` - Setup PS Run environment
- `createPsRunWorkspace()` - Create temporary workspace
- `createScript()` - Generate test scripts
- `getPsRunHelper()` - Access PS Run helpers
- `getLogPath()` - Locate generated logs

### `action-safety-test-helpers.js`
Action safety and scanning utilities:
- `listActionYmls()` - Find all action.yml files
- `scanRunBlocks()` - Analyze run blocks for security issues

## Import Paths

Test files import from the shared `helpers/` directory using relative paths:

```javascript
// From unit/bash-syntax.test.js
import { fail, getRepoRoot, section } from '../helpers/test-helpers.js';

// From integration/ps-run.logging.test.js
import { buildPsRunEnv } from '../helpers/ps-run-test-helpers.js';

// From safety/action-run-safety.test.js
import { listActionYmls, scanRunBlocks } from '../helpers/action-safety-test-helpers.js';
```

## Test Naming Conventions

### File Names
- `{module}.test.js` - Standard test file
- `{module}.test.js.skip` - Skipped test (not run)
- `{component}.{aspect}.test.js` - Aspect-specific tests (e.g., `ps-run.logging.test.js`, `ps-run.security.test.js`)

### Helper Functions
- `build*` - Setup functions (e.g., `buildPsRunEnv`, `buildSafeEnv`)
- `create*` - Factory functions (e.g., `createScript`, `createPsRunWorkspace`)
- `get*` - Accessor functions (e.g., `getRepoRoot`, `getLogPath`)
- `read*` - File reading functions (e.g., `readYamlFile`, `readLog`)
- `list*` - Enumeration functions (e.g., `listActionYmls`)
- `scan*` - Analysis functions (e.g., `scanRunBlocks`)

### Assertion Patterns
- `fail(section, message)` - Report and fail test
- `info(message)` - Log informational message
- `section(name, title, detail)` - Log test section header
- `detail(key, value)` - Log detailed information

## Adding New Tests

1. **Determine Category:**
   - Unit: Single function/module tests → `unit/`
   - Integration: Multi-component tests → `integration/`
   - Safety: Security/validation checks → `safety/`
   - Contracts: Compliance tests → `contracts/`

2. **Create Test File:**
   ```bash
   cd tools/tests/{category}
   touch {module}.test.js
   ```

3. **Add Header:**
   ```javascript
   #!/usr/bin/env node

   // ==============================================================================
   // Political Sphere — {Test Name}
   // ==============================================================================
   // Purpose:
   //   {Description}
   // ==============================================================================
   ```

4. **Import Helpers:**
   ```javascript
   import { fail, section } from '../helpers/test-helpers.js';
   ```

5. **Structure Test:**
   ```javascript
   section('tests', 'Test Suite Name', 'Description');

   try {
     // Test logic
     console.log('✓ Test passed');
   } catch (error) {
     fail('tests', `Test failed: ${error.message}`);
   }
   ```

## Test Execution Order and Dependencies

- **Unit tests** run first (fastest, no dependencies)
- **Integration tests** run next (may depend on infrastructure)
- **Safety tests** run next (security-focused, independent)
- **Contract tests** run last (comprehensive validation)

Within each category, tests are independent and can run in parallel.

## Debugging Tests

### Verbose Output
```bash
node --inspect-brk unit/bash-syntax.test.js
```

### Check Temporary Files
Integration tests create temporary files in `/tmp`. Check for:
- Workspace files in `${TMPDIR}ps-*`
- Log files in generated locations
- Generated scripts and artifacts

### View Test Logs
```bash
cat /logs/lint/lint-summary.log
cat /logs/tests/validate-ci.log
```

## Performance Considerations

- **Unit tests**: ~100ms each
- **Integration tests**: 500ms-5s each (I/O bound)
- **Safety tests**: ~200ms each
- **Contract tests**: ~100-500ms each

Total test suite: ~30-60 seconds

For faster feedback during development, run relevant category or specific test file:
```bash
npm test -- unit/bash-syntax.test.js
npm test -- integration/ps-run.logging.test.js
```

## CI Integration

Tests are run in CI as part of pre-commit gates and CI validation:
- Pre-commit hooks run fast unit/safety tests
- Full test suite runs in CI pipelines
- Contract tests validate deployment readiness

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for CI test execution details.
