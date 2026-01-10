# Entrypoint

This module handles process-level concerns and the top-level CLI bootstrap for PoliticalSphere's CLI.

Purpose

- Install global handlers for broken pipes (EPIPE) so the process exits quietly when output is piped to short-circuiting tools (e.g., head/tail).
- Catch and report uncaught errors and promise rejections from the `main` orchestration function and ensure a deterministic exit code.
- Install optional signal handlers for `SIGINT` and `SIGTERM` and invoke a configurable `onSignal` handler for graceful shutdown (if provided in `EntrypointDeps`).
- Provide a small, testable `runEntrypoint()` surface that callers (or node self-execution) call to start the CLI safely.

Key exports

- `runEntrypoint(deps?: EntrypointDeps): void` — installs handlers and calls `main()`, handling rejected promises and setting `process.exitCode` on fatal errors.
- `EntrypointDeps` — dependency injection for tests (e.g., `mainFn`, custom `console`), allowing controlled behavior in unit tests.

Behavior notes

- EPIPE errors are ignored to allow common piping workflows (e.g., `ps-lint | head`). Non-EPIPE stream errors are re-thrown to surface issues.
- When `main()` rejects, the entrypoint logs a fatal error and sets `process.exitCode = 1`.
- The module detects self-execution (via `import.meta.url` vs `process.argv[1]`) and will call `runEntrypoint()` automatically when executed as a script.

Testing

- Unit tests should exercise:
  - that `runEntrypoint()` installs the broken-pipe handlers and that EPIPE errors are ignored
  - that rejected `mainFn` promises are reported via `console.error` and cause `process.exitCode` to be set
  - that self-execution detection only runs the entrypoint when the module file is the entry module

Example

```ts
import { runEntrypoint } from './entrypoint.ts';

// Normal invocation when running the package as an executable
runEntrypoint();

// In tests, inject a controlled `mainFn` for deterministic behavior
runEntrypoint({ mainFn: () => Promise.resolve({ exitCode: 0 }) });
```

Guidance for maintainers

- Keep the entrypoint thin and delegate orchestration to `core/index.ts` and `execution/*` modules.
- Use dependency injection for side-effects (console, timers) to keep tests fast and deterministic.
- Document any global handlers added by the entrypoint; these are visible to the entire process and should be intentional.
