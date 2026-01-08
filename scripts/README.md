# Test Utilities

This directory contains utilities and test helpers for script testing within the CI pipeline.

## Overview

The test utilities provide convenience functions for executing and testing shell scripts programmatically, with proper error handling and environment variable support.

## Available Utilities

### `test-utils.ts`

Provides core utilities for executing shell scripts in tests:

#### `runScript(scriptPath, args?): Promise<ExecResult>`

Executes a shell script synchronously and returns the result.

**Parameters:**

- `scriptPath` (string): Absolute path to the script to execute
- `args` (string[], optional): Arguments to pass to the script

**Returns:** `Promise<ExecResult>` containing:

- `stdout` (string): Standard output from the script
- `stderr` (string): Standard error from the script  
- `code` (number): Exit code (0 for success, non-zero for failure)

**Example:**

```typescript
import { runScript } from './test-utils.ts';

const result = await runScript('./scripts/check-ci-status/check-ci-status.ts', ['--verbose']);
expect(result.code).toBe(0);
expect(result.stdout).toContain('success');
```

#### `runScriptWithEnv(scriptPath, args?, env?): Promise<ExecResult>`

Executes a shell script with custom environment variables merged with the current process environment.

**Parameters:**

- `scriptPath` (string): Absolute path to the script to execute
- `args` (string[], optional): Arguments to pass to the script
- `env` (Record<string, string>, optional): Environment variables to inject/override

**Returns:** `Promise<ExecResult>` - Same as `runScript()`

**Example:**

```typescript
import { runScriptWithEnv } from './test-utils.ts';

const result = await runScriptWithEnv(
  './scripts/my-script.ts',
  ['--check'],
  { CI: 'true', DEBUG: '1' }
);
```

#### `parseExecError(error): ExecResult`

Utility function that parses Node.js exec errors and extracts execution results with fallback defaults.

**Parameters:**

- `error` (unknown): Error object from exec (may have `stdout`, `stderr`, `code` properties)

**Returns:** `ExecResult` with safe defaults:

- `stdout`: Empty string if not provided
- `stderr`: Empty string if not provided
- `code`: 1 (error) if not provided

**Note:** Typically used internally by `runScript()` and `runScriptWithEnv()`, but exported for advanced testing scenarios.

## Script Subdirectories

### `check-ci-status/`

Utilities for validating CI pipeline status and workflows. See [check-ci-status/README.md](check-ci-status/README.md) for details.

### `validate-action-pinning/`

Utilities for verifying GitHub Actions are properly pinned to specific versions. See [validate-action-pinning/README.md](validate-action-pinning/README.md) for details.

## Error Handling

Both `runScript()` and `runScriptWithEnv()` implement graceful error handling:

- Successful script execution returns `code: 0`
- Failed execution returns the exit code and captured output
- Errors are never thrown; instead, error details are returned in the result object
- Both `stdout` and `stderr` are always available, never undefined

## Testing Patterns

### Basic Success Test

```typescript
import { runScript } from './test-utils.ts';
import { describe, expect, it } from 'vitest';

describe('my-script.ts', () => {
  it('exits with success', async () => {
    const result = await runScript('./scripts/my-script.ts');
    expect(result.code).toBe(0);
  });
});
```

### Testing Output

```typescript
const result = await runScript('./scripts/my-script.ts');
expect(result.stdout).toContain('expected message');
expect(result.stderr).toBe('');
```

### Testing with Arguments

```typescript
const result = await runScript(
  './scripts/my-script.ts',
  ['--flag', 'value']
);
expect(result.code).toBe(0);
```

### Testing with Environment Variables

```typescript
const result = await runScriptWithEnv(
  './scripts/my-script.ts',
  [],
  { NODE_ENV: 'production', DEBUG: '1' }
);
expect(result.code).toBe(0);
```

### Testing Error Cases

```typescript
const result = await runScript('./scripts/my-script.ts', ['--invalid-flag']);
expect(result.code).not.toBe(0);
expect(result.stderr).toBeTruthy();
```

## Related Files

- [test-utils.ts](test-utils.ts) - Implementation of core utilities
- [test-utils.test.ts](test-utils.test.ts) - Comprehensive test suite with usage examples
