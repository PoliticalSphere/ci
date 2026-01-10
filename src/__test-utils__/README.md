# Test Utilities (`__test-utils__`)

This directory contains shared testing infrastructure and mock factories for the Political Sphere CI pipeline. These utilities provide reusable components for deterministic, isolated unit and integration tests.

## Overview

The `__test-utils__` directory exports mock implementations and factory functions that enable consistent, repeatable test scenarios without external dependencies or side effects.

## Modules

### Console Capture (`console-capture.ts`)

Capture and verify console output during tests without affecting test reporting.

#### Functions

**`captureLogs(): void`**

- Starts capturing all console methods (`log`, `error`, `warn`, `info`)
- Must call `restoreLogs()` to clean up
- Resets previous captures

**`restoreLogs(): void`**

- Restores original console methods
- Should be called in test cleanup (e.g., `afterEach`)

**`getLogs(): string[]`**

- Returns array of captured log messages

**`getErrors(): string[]`**

- Returns array of captured error messages

**`getWarnings(): string[]`**

- Returns array of captured warning messages

**`getInfos(): string[]`**

- Returns array of captured info messages

**`clearCaptured(): void`**

- Clears all captured output without restoring console

#### Example

```typescript
import { captureLogs, getLogs, restoreLogs } from '__test-utils__';
import { afterEach, describe, expect, it } from 'vitest';

describe('my-module', () => {
  afterEach(() => restoreLogs());

  it('logs expected messages', () => {
    captureLogs();
    
    console.log('Hello');
    console.error('Error message');
    
    expect(getLogs()).toContain('Hello');
    expect(getErrors()).toContain('Error message');
  });
});
```

### Event Emitter Mock (`emitter.ts`)

Lightweight mock implementation of Node.js `EventEmitter` for deterministic event testing.

#### `MockEmitter` Class

**Methods:**

- **`on(event, callback): this`** - Register a listener
- **`once(event, callback): this`** - Register a one-time listener
- **`off(event, callback): this`** - Remove a specific listener
- **`emit(event, ...args): void`** - Emit an event to all listeners
- **`removeAllListeners(event?): this`** - Remove all listeners for an event or all events
- **`listenerCount(event): number`** - Get count of listeners for an event

#### Helper Functions

**`createMockChild(): MockChild`**

- Creates a mock child process with stub methods

**`mockStreamData(emitter, data): void`**

- Helper to simulate stream data emission

**`mockProcessError(emitter, error): void`**

- Helper to simulate process error events

**`mockProcessExit(emitter, code): void`**

- Helper to simulate process exit events

#### Example

```typescript
import { MockEmitter, mockStreamData } from '__test-utils__';

describe('event handling', () => {
  it('emits and receives events', () => {
    const emitter = new MockEmitter();
    const results: unknown[] = [];
    
    emitter.on('data', (value) => results.push(value));
    mockStreamData(emitter, 'test output');
    
    expect(results).toContain('test output');
  });
});
```

### Linter Fixtures (`linter-fixtures.ts`)

Factory functions for creating test linter configurations.

#### Types

**`LinterTestConfig`** extends `LinterConfig` with:

- `simulateOutput?: string` - Mock process output
- `simulateError?: Error` - Mock process error
- `simulateExitCode?: number` - Mock exit code

#### Functions

**`createLinterConfig(overrides?): LinterConfig`**

- Creates a minimal valid linter configuration
- All properties have sensible defaults
- Accepts optional overrides

```typescript
const config = createLinterConfig({
  id: 'eslint',
  binary: 'eslint',
  args: ['src/']
});
```

**`createMockLinterConfig(overrides?): LinterTestConfig`**

- Creates a test linter config with simulation options
- Extends `createLinterConfig` with test-specific properties
- Useful for mocking process behavior

```typescript
const config = createMockLinterConfig({
  id: 'knip',
  simulateOutput: 'Unused exports:\n  foo',
  simulateExitCode: 1
});
```

### Stream Mocks (`stream-mocks.ts`)

Mock implementations of Node.js streams for I/O testing.

#### Types

**`StreamMock`** - Mock implementation of `NodeJS.WriteStream` with:

- `isTTY: boolean` - Whether stream is a TTY
- `data: string[]` - Captured written data
- `errors: Error[]` - Captured errors
- `closed: boolean` - Stream closed state

#### Functions

**`createStreamMock(): StreamMock`**

- Creates a single mock write stream
- Captures all written data
- Tracks stream state

**`createStreamMockPair(): { stdout: StreamMock; stderr: StreamMock }`**

- Creates paired stdout and stderr streams
- Useful for capturing both output channels

#### Example

```typescript
import { createStreamMockPair } from '__test-utils__';

describe('output formatting', () => {
  it('writes to stdout and stderr', () => {
    const { stdout, stderr } = createStreamMockPair();
    
    stdout.write('Success message');
    stderr.write('Error message');
    
    expect(stdout.data).toContain('Success message');
    expect(stderr.data).toContain('Error message');
  });
});
```

### CLI Main Fixtures (`cli-main-fixtures.ts`)

Mock factories for CLI main function dependencies.

#### Functions

**`createMainTestDeps(argv, injectedConsole?): TestDeps`**

- Creates complete mock dependency bundle for CLI main tests
- Pre-configures all required function mocks:
  - `mkdirFn` - Directory creation
  - `renderDashboardFn` - Dashboard rendering
  - `renderWaitingHeaderFn` - Waiting UI
  - `executeLintersFn` - Linter execution
  - `calculateSummaryFn` - Summary calculation
  - `acquireExecutionLockFn` - Execution lock
- Returns both individual mocks and complete options object

#### Example

```typescript
import { createMainTestDeps } from '__test-utils__';
import { main } from '../cli/index.ts';

describe('main CLI', () => {
  it('processes linters with test dependencies', async () => {
    const deps = createMainTestDeps(['--check']);
    
    const result = await main(deps.options);
    
    expect(deps.executeLintersFn).toHaveBeenCalled();
    expect(result.code).toBe(0);
  });
});
```

## Common Testing Patterns

### Testing Console Output

```typescript
import { captureLogs, getErrors, getLogs, restoreLogs } from '__test-utils__';
import { afterEach, describe, it } from 'vitest';

describe('logger', () => {
  afterEach(() => restoreLogs());

  it('outputs messages correctly', () => {
    captureLogs();
    myLogger.log('message');
    expect(getLogs()).toContain('message');
  });
});
```

### Testing Event Flow

```typescript
import { MockEmitter, mockStreamData } from '__test-utils__';

describe('stream processor', () => {
  it('processes stream events', () => {
    const emitter = new MockEmitter();
    const processor = new StreamProcessor(emitter);
    
    mockStreamData(emitter, 'chunk1');
    mockStreamData(emitter, 'chunk2');
    
    expect(processor.chunks).toEqual(['chunk1', 'chunk2']);
  });
});
```

### Testing with Mock Linters

```typescript
import { createMockLinterConfig } from '__test-utils__';

describe('executor', () => {
  it('handles linter success', async () => {
    const config = createMockLinterConfig({
      id: 'test',
      simulateExitCode: 0
    });
    
    const result = await executeLinter(config);
    expect(result.status).toBe('PASS');
  });
});
```

### Testing Stream Operations

```typescript
import { createStreamMockPair } from '__test-utils__';

describe('writer', () => {
  it('writes formatted output', () => {
    const { stdout } = createStreamMockPair();
    
    writer.format('result', stdout);
    
    expect(stdout.data.join('')).toContain('result');
    expect(stdout.closed).toBe(true);
  });
});
```

## Best Practices

1. **Always Restore State**

    ```typescript
    afterEach(() => {
      restoreLogs();
      // Other cleanup
    });
    ```

2. **Use Specific Mocks**
   - Create only the mocks needed for each test
   - Use `createLinterConfig` for most linter tests
   - Use `createMockLinterConfig` when testing behavior based on exit codes or output

3. **Clear Captured Output**

    ```typescript
    beforeEach(() => clearCaptured());
    afterEach(() => restoreLogs());
    ```

4. **Verify Listener Count**

    ```typescript
    const emitter = new MockEmitter();
    emitter.on('data', callback);
    expect(emitter.listenerCount('data')).toBe(1);
    ```

5. **Inspect Stream State**

    ```typescript
    const stream = createStreamMock();
    stream.write('test');
    expect(stream.data).toEqual(['test']);
    expect(stream.closed).toBe(false);
    ```

## Index Export

The `index.ts` file re-exports all public utilities:

```typescript
export {
  captureLogs,
  clearCaptured,
  getErrors,
  getInfos,
  getLogs,
  getWarnings,
  restoreLogs,
} from './console-capture.ts';

export {
  createMockChild,
  MockEmitter,
  mockProcessError,
  mockProcessExit,
  mockStreamData,
} from './emitter.ts';

export type { LinterTestConfig };
export { createLinterConfig, createMockLinterConfig } from './linter-fixtures.ts';

export type { StreamMock };
export { createStreamMock, createStreamMockPair } from './stream-mocks.ts';
```

Import from the root: `import { captureLogs, MockEmitter } from '__test-utils__';`

## Related Files

- [index.ts](index.ts) - Central export point
- [console-capture.ts](console-capture.ts) - Console output capture
- [emitter.ts](emitter.ts) - Event emitter mock
- [linter-fixtures.ts](linter-fixtures.ts) - Linter configuration factories
- [stream-mocks.ts](stream-mocks.ts) - Stream mock implementations
- [cli-main-fixtures.ts](cli-main-fixtures.ts) - CLI dependency bundles

## See Also

- [Linter Registry](../cli/config/linter-registry.ts) - Production linter configurations
- [Executor](../cli/executor.ts) - Linter execution logic
- [CLI](../cli/index.ts) - Main CLI entry point
