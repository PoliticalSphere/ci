# CLI — Infrastructure

> Cache and incremental execution support used by the CLI orchestration

This folder contains low-level infrastructure primitives used by the execution layer:

- **`ExecutionCache`** (in `cache.ts`): an execution-scoped, in-memory cache for binary checks, version verifications, and skip decisions. It offers configurable TTLs, optional backends, LRU trimming, and git-state-based invalidation for file-dependent entries.
- **`IncrementalExecutionTracker`** (in `incremental.ts`): git-aware change detection and file-pattern tracking that lets the CLI skip linters when no relevant files changed.

Files

- `cache.ts` — `ExecutionCache`, cache backends, configuration (TTL, max entries), and helpers like `createExecutionCache()`.
- `incremental.ts` — `IncrementalExecutionTracker`, default linter file patterns, pattern safety checks, and `enableIncrementalExecution` / `disableIncrementalExecution` helpers.
- `index.ts` — exports for the infrastructure layer.

Important behaviors & guidelines 🔧

- Execution-scoped: `ExecutionCache` instances are meant to be passed via DI into the execution context — they are **not** global singletons.
- Git-awareness: skip decisions are hashed against a computed git state so cached skip decisions are invalidated when relevant files change.
- Pattern safety: file patterns are validated against a conservative regex to avoid surprising shell/glob injections — preserve this when updating pattern logic.
- TTLs & LRU: caches have sensible TTL defaults (short for skip decisions, longer for binaries/versions) and optional max entry limits for LRU-like eviction.
- Deterministic fallback: when git is unavailable, the tracker conservatively assumes changes (safe default for CI).

Testing guidance ✅

- Use dependency injection to control timing and FS primitives (e.g., `stat`, `now`, `writeFile`) for deterministic tests.
- `ExecutionCache` tests: TTL expiry, hash invalidation for skip decisions, backend swap-out, `getStats()` values, and `clear()` behaviors.
- `IncrementalExecutionTracker` tests: pattern registration and safety, `detectChanges()` with mocked git outputs, `getExecutionDecision()` caching and check intervals, and `enable/disable` global tracker semantics.
- When testing git-dependent behaviors, mock `execFileSync` outputs to avoid relying on repository state.

Examples

- Create and pass a cache to execution:

```ts
import { createExecutionCache } from './infrastructure/cache';
const cache = createExecutionCache({ binaryTtlMs: 300_000 });
// pass `cache` into execution context
```

- Use incremental tracker programmatically:

```ts
import { enableIncrementalExecution, getGlobalTracker } from './infrastructure/incremental';
const tracker = enableIncrementalExecution();
const decision = tracker.getExecutionDecision('eslint');
// disable when done
tracker.clear();
```

Notes & security ⚠️

- Keep the pattern-validation regex and path sanitation in place; they prevent unsafe glob expressions and path traversal surprises.
- The code intentionally uses small TTLs for change-sensitive caches to reduce stale behavior in active development.
