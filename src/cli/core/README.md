# CLI — Core

> Core utilities and process entrypoint for the CLI

This folder contains the core runtime building blocks of the CLI: process entrypoint handling, help/formatter utilities, version loading, and the `main` orchestration wrapper. The code here is small but critical — it manages process-level concerns, exposes public `main`/`runEntrypoint` entrypoints, and formats CLI-facing output (help/version).

Files

- `index.ts` — public module surface for `src/cli/core` and `main()` function; re-exports commonly used APIs (execution, input, output, observability, config). Handles `--help` and `--version` short-circuit logic.
- `entrypoint/entrypoint.ts` — process-level setup for EPIPE handling, signal/unhandled-rejection handlers, and `runEntrypoint()` which bootstraps the CLI process (safe shutdown, forced exit on fatal errors).
- `help/formatter.ts` — generates formatted help text and sanitizes output for display.
- `help/help.ts` — convenience re-exports and `showVersion()` implementation.
- `version/version.ts` — safely reads and caches `package.json` version (with validation and a fallback) and exposes `getPackageVersion()`.

Responsibilities & Guidelines

- Process safety: handle broken pipes (EPIPE) quietly so piping to tools like `head`/`tail` does not cause noisy failures.
- Determinism: keep main orchestration deterministic and side-effect free where possible; prefer dependency injection for testability (see `EntrypointDeps`).
- Export surface: keep `index.ts` focused on re-exporting cross-cutting functions instead of adding business logic.
- Small & testable: prefer small functions that can be tested in isolation (e.g., `handleBrokenPipe`, `showHelp`, `getPackageVersion`).

Testing

- Tests live adjacent to implementation: `entrypoint.test.ts`, `help/help.test.ts`, `version.test.ts`, and `cli.integration.test.ts` exercise different surface areas.
- `entrypoint` tests should verify signal handling, EPIPE ignoring behavior, and that shutdown hooks are invoked.
- `version` tests validate safe file resolution and fallback semantics — these exercise path validation logic and cached read behavior.

Notes & Security

- `version.ts` validates the resolved `package.json` path at import time to avoid path traversal risks. Maintain this check if refactoring.
- The entrypoint intentionally forces process exit after a timeout to avoid processes hanging during shutdown; keep this behaviour explicit and documented.

Examples

- Programmatic `main` usage (useful for tests and embedding):

```ts
import { main } from '../src/cli/core/index';
await main();
```

- Running as an executable: the module detects self-execution and calls `runEntrypoint()` to install global handlers and invoke the CLI.

---

**Tip:** When adding new exposed behavior here, add unit tests and ensure the public contract remains small and well-documented.
