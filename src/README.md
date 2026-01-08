# Source Code (`src/`)

This directory contains the complete implementation of the Political Sphere CI infrastructure, including the parallel linter CLI and policy engine.

## Structure

```text
src/
├── __test-utils__/          # Shared testing utilities and mock factories
├── cli/                     # Parallel linter orchestration CLI
├── policy/                  # Policy engine for risk classification and decision-making
├── errors.ts                # Shared error hierarchy
├── index.ts                 # Main entry point and re-exports
└── README.md                # This file
```

## Top-Level Exports (`index.ts`)

The main entry point exports the complete public API:

- **Version:** `VERSION` constant
- **Execution Lock:** `DEFAULT_EXECUTION_LOCK_PATH`
- **Policy Types & Functions:** All types and functions from the policy engine
- **Config:** `CIConfig` and `config` object defining the execution tiers

### Quick Import

```typescript
import {
  VERSION,
  evaluatePolicy,
  classifyRisk,
  LINTER_REGISTRY,
  // ... and many more
} from '@political-sphere/ci';
```

## Modules

### CLI (`cli/`)

**Parallel linter orchestration with real-time dashboard and deterministic logging.**

The CLI module provides:

- **Argument Parsing** — Safe, validated CLI argument handling
- **Linter Registry** — Declarative registry of 9+ security and code quality linters
- **Execution Engine** — Parallel linter execution with retry logic and timeout handling
- **Dashboard UI** — Real-time terminal dashboard for progress visualization
- **Logging** — Deterministic, byte-for-byte reproducible log files
- **Execution Lock** — Prevents concurrent execution in CI environments

**Key Files:**

- `index.ts` — Main CLI entry point and argument parsing
- `linters.ts` — Linter registry and configuration
- `executor.ts` — Core execution logic for running linters in parallel
- `execution-lock.ts` — Distributed lock implementation
- `logger.ts` — Deterministic logging to files
- `ui.tsx` — Terminal dashboard component (React/Ink)
- `modules/` — Low-level utilities for binary checking, file system operations, etc.

**Common Commands:**

```bash
# Run all linters
npm run lint

# Run specific linters
npm run lint -- --linters eslint,typescript

# With custom log directory
npm run lint -- --log-dir ./ci-logs
```

See [cli/README.md](cli/README.md) for detailed documentation.

### Policy Engine (`policy/`)

**Deterministic policy-as-code for risk classification and governance validation.**

The policy engine provides:

- **Risk Classification** — File-pattern-based classification into low/medium/high risk tiers
- **AI Attestation** — Parsing and validation of AI-assisted change declarations
- **High-Risk Governance** — Validation of governance attestations for sensitive changes
- **Policy Decision** — Aggregated allow/warn/deny decisions with violation reporting
- **Markdown Reporting** — Human-readable summaries for PR comments

**Key Files:**

- `index.ts` — Main entry point and API re-exports
- `risk-classification.ts` — File pattern classification with rules and patterns
- `attestation.ts` — AI attestation parsing and validation
- `decision.ts` — Policy aggregation and decision logic

**Common Usage:**

```typescript
import { evaluatePolicy, generateMarkdownSummary } from '@political-sphere/ci';

const result = evaluatePolicy({
  changedFiles: ['src/app.ts'],
  prBody: '- [x] **AI-assisted changes**: Yes...',
});

console.log(result.result.decision); // 'allow' | 'warn' | 'deny'
console.log(generateMarkdownSummary(...));
```

See [policy/README.md](policy/README.md) for detailed documentation.

### Error Hierarchy (`errors.ts`)

**Structured, consistent error handling across the application.**

Defines:

- `AppError` — Base error class with error codes and details
- `CliError` — CLI-specific errors
- `ExecutionLockError` — Lock acquisition/release failures
- `ProcessError` — Process execution failures
- `BinaryError` — Binary availability/version errors
- `formatErrorMessage()` — Safe error message formatting

**Error Codes:**

```typescript
type ErrorCode =
  | 'CLI_INVALID_ARGUMENT'
  | 'CLI_UNKNOWN_OPTION'
  | 'EXECUTION_LOCK_ACQUIRE_FAILED'
  | 'PROCESS_SPAWN_FAILED'
  | 'PROCESS_TIMEOUT'
  | 'BINARY_NOT_FOUND'
  | 'BINARY_VERSION_MISMATCH'
  | ... and more
```

**Usage:**

```typescript
import { CliError } from '@political-sphere/ci/errors';

throw new CliError(
  'CLI_INVALID_ARGUMENT',
  'Invalid linter ID',
  { details: { provided: 'foo', valid: ['eslint', 'typescript'] } }
);
```

### Test Utilities (`__test-utils__/`)

**Shared mocking and fixture infrastructure for testing.**

Provides:

- **Console Capture** — Capture and verify console output
- **Event Emitter Mock** — Lightweight `EventEmitter` mock for testing
- **Linter Fixtures** — Factory functions for creating test linter configurations
- **Stream Mocks** — Mock implementations of Node.js streams
- **CLI Fixtures** — Bundled mock dependencies for CLI tests

**Quick Example:**

```typescript
import { captureLogs, getLogs, createLinterConfig } from '@political-sphere/ci/__test-utils__';

captureLogs();
console.log('test');
expect(getLogs()).toContain('test');

const config = createLinterConfig({ id: 'eslint' });
```

See [`__test-utils__/README.md`](__test-utils__/README.md) for detailed documentation.

## Architecture Principles

### Separation of Concerns

1. **CLI Module** — Orchestration and user interface
   - Handles argument parsing
   - Manages execution flow
   - Provides real-time feedback

2. **Policy Engine** — Business logic
   - Pure functions (no side effects)
   - Deterministic classification
   - Auditable decision trails

3. **Errors** — Cross-cutting concern
   - Consistent error handling
   - Type-safe error codes
   - Structured error details

4. **Test Utilities** — Developer productivity
   - Isolated from production code
   - Pure re-exports
   - No runtime dependencies

### Design Patterns

- **Registry Pattern** — Linter registry declaratively defines all linters
- **Factory Pattern** — Fixture factories create consistent test data
- **Module Re-exports** — Barrel exports for convenient public APIs
- **Error Hierarchy** — Type-safe error handling with specific error codes

## Type Safety

All modules are written in TypeScript with strict mode enabled:

```typescript
// CLI Arguments are type-safe
const args: CLIArgs = parseCliArgs(process.argv);

// Policy results are structured
const result: PolicyResult = evaluatePolicy({...});

// Error codes are discriminated
if (error instanceof CliError && error.code === 'CLI_INVALID_ARGUMENT') {
  // ...
}
```

## Testing

All modules have corresponding test files:

- `errors.test.ts` — Error hierarchy and formatting
- `index.test.ts` — Main exports and re-exports
- `cli/index.test.ts` — CLI argument parsing
- `cli/executor.test.ts` — Linter execution logic
- `cli/linters.test.ts` — Linter registry validation
- `cli/modules/*.test.ts` — Individual module utilities
- `policy/**/*.test.ts` — Policy engine components
- `__test-utils__/**/*.test.ts` — Test utility correctness

Run tests with:

```bash
npm run test:coverage
```

## Integration Points

### Consuming the CLI

```typescript
import { main } from '@political-sphere/ci';

const result = await main({
  argv: ['--linters', 'eslint,typescript'],
  logDir: './logs',
});

process.exit(result.code);
```

### Consuming the Policy Engine

```typescript
import { evaluatePolicy, classifyRisk } from '@political-sphere/ci';

const classification = classifyRisk(['src/app.ts']);
const policy = evaluatePolicy({
  changedFiles: ['src/app.ts'],
  prBody: '...',
});
```

### Custom Error Handling

```typescript
import { AppError, formatErrorMessage } from '@political-sphere/ci';

try {
  await runLinters();
} catch (error) {
  if (error instanceof AppError) {
    console.error(`[${error.code}] ${error.message}`);
    if (error.details) {
      console.error(JSON.stringify(error.details));
    }
  }
}
```

## Performance Characteristics

- **CLI Execution** — O(1) orchestration overhead, linear in number of linters
- **Policy Classification** — O(n) in number of changed files
- **Risk Assessment** — O(n*m) in files × high-risk patterns (typically small)
- **Parallel Execution** — Uses N-1 CPU cores for linter execution

## Version Information

Current version: `0.0.1`

Execution tiers:

1. `biome` — Code formatting
2. `eslint` — Linting
3. `typescript` — Type checking
4. `knip` — Unused exports
5. `orthogonal` — Duplicate detection, shell checking, etc.
6. `policy` — Policy engine validation

## See Also

- [CLI Documentation](cli/README.md)
- [Policy Engine Documentation](policy/README.md)
- [Test Utilities Documentation](__test-utils__/README.md)
- [Error Handling](errors.ts)
- [Main Package](../README.md)
