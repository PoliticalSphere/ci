# CLI — Execution

> Deterministic orchestration and parallel execution primitives for the CLI

This folder implements the runtime execution engine used by the CLI to run linters concurrently, capture logs and telemetry, and coordinate process-level concerns such as locking and shutdown. The code focuses on deterministic behavior, failure semantics, and testability.

Files

- `index.ts` — thin re-exports for the execution API (intentionally excluded from coverage).
- `execution.ts` — top-level orchestration (`executeWithArgs`) that initializes caching, incremental execution, acquisition of the execution lock, dashboard rendering, telemetry export, and final summary/exit code semantics.
- `executor.ts` — the parallel execution engine (`executeLintersInParallel`) and single-linter execution (`executeLinter`) with concurrency control, retry logic, circuit breaker integration, tracing, and log/telemetry capture.
- `execution-lock.ts` — process-level lock implementation to prevent concurrent orchestrator runs (defaults to a tmp file lock path).

Important behaviors & guidelines

- Concurrency: by default, parallelism is `cpus().length - 1` unless overridden via `options.concurrency`.
- Retries & transient errors: `executeLinter` supports retrying transient failures (default retry count is configurable via options). Retry backoff is minimal and intentional to keep fast CI runs.
- Circuit breaker: optional per-linter circuit breaker supports automatic skipping of repeatedly failing linters for a cooldown period; defaults exist for threshold and cooldown time.
- Incremental execution & caching: `execution.ts` wires in incremental execution and an execution cache that can be disabled via `--clear-cache`.
- Execution lock: `acquireExecutionLock` prevents concurrent runs by writing a lock file (default in the system tmp dir); it cleans up stale locks and registers signal handlers to release the lock on exit.
- Security: path checks are enforced (e.g., file expansions are validated to be within the working directory) — keep these checks when making changes.
- Determinism: keep side effects explicit and ensure telemetry and logs are written reliably (temporary files are used during write then renamed for atomicity when appropriate).

Testing guidance

- Unit test `executeLinter` behaviors: success, failure, retry, transient vs non-transient errors, incremental skip, file-pattern expansion and path validation, and circuit breaker transitions.
- Integration tests: verify `executeWithArgs` uses initialization/cleanup correctly (lock acquisition/release, dashboard lifecycle, telemetry file creation) and exit code semantics for failing vs passing runs.
- Lock tests: verify stale-lock removal, waiting behavior (onWaitStart/onWaitEnd), and that signal/exit handlers call `release()`.
- Use dependency injection for file system and timing primitives when testing (e.g., `writeFileFn`, `mkdirFn`, `nowFn`, `sleepFn`) to make tests deterministic and fast.

Examples

- Programmatic execution

```ts
import { executeWithArgs } from '../src/cli/execution/execution';
await executeWithArgs(args, { cwd: '/path/to/repo' });
```

- Acquire lock manually (testing or specialized scripts)

```ts
import { acquireExecutionLock, DEFAULT_EXECUTION_LOCK_PATH } from '../src/cli/execution/execution-lock';
const lock = await acquireExecutionLock({ lockPath: DEFAULT_EXECUTION_LOCK_PATH });
// ... do work ...
await lock.release();
```

Notes

- Keep `index.ts` excluded from coverage because it only re-exports symbols and contains no runtime logic.
- When refactoring, ensure telemetry export and cleanup logic in `executeWithArgs` remains robust and that `release()` is always invoked on lock objects (including on signal or fatal errors).
