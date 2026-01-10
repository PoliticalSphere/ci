# CLI — Input

> Argument parsing and input validation for the CLI

This folder centralizes CLI argument parsing, normalization, and input validation logic. It provides a small, well-documented surface that the rest of the CLI uses to interpret user intent and guard against invalid or unsafe input.

Files

- `index.ts` — thin re-exports for public input API (`parseCliArgs`, `resolveLinters`, `ensureSafeDirectoryPath`).
- `args.ts` — command-line parsing and normalization (`parseCliArgs`), maps parse errors into `CliError` values for consistent handling.
- `validation.ts` — `resolveLinters` (map user-specified linter ids to registry entries, validate formats, dedupe, enforce limits) and `ensureSafeDirectoryPath` (resolve and validate paths, guard against null bytes/traversal/symlink escapes).

Responsibilities & guidelines

- Keep parsing and validation logic deterministic and side-effect free where possible.
- Map user-facing parse and validation errors to `CliError` instances with actionable messages.
- Enforce safe defaults and conservative behavior: e.g., validation disallows empty linter IDs, rejects invalid formats, and treats missing git or unexpected state conservatively.
- Validate and normalize inputs early; callers should rely on `parseCliArgs` and `resolveLinters` for sanitized outputs.

Security & safety notes ⚠️

- `ensureSafeDirectoryPath` defends against null-byte injection, path traversal, and symlink escapes by resolving against a validated baseDir and checking `realpath` values — keep this logic intact when refactoring.
- Linter ID validation uses a strict pattern and limits to prevent injection or DOS (too many IDs or overly long IDs).

Testing guidance ✅

- `parseCliArgs` tests should cover:
  - Unknown options, missing values, invalid values (mapped to proper `CliError` codes)
  - Positionals producing `CLI_INVALID_ARGUMENT`
  - `--linters` parsing (comma-separated and multiple entries)
  - `--log-dir` validation and trimming
- `resolveLinters` tests should cover:
  - Empty input (returns full registry)
  - Invalid formats, too many IDs, overly long IDs
  - Unknown IDs reporting valid linter suggestions
  - Duplicate IDs detection
- `ensureSafeDirectoryPath` tests should cover:
  - Null bytes in input
  - Path traversal attempts (../)
  - Very long paths
  - Behavior when base directory or parent doesn't exist (resolves safely)

Examples

- Parse args

```ts
import { parseCliArgs } from './input/args';
const args = parseCliArgs(process.argv.slice(2));
```

- Resolve linters

```ts
import { resolveLinters } from './input/validation';
const selected = resolveLinters(['eslint', 'biome']);
```

- Validate a log directory

```ts
import { ensureSafeDirectoryPath } from './input/validation';
const logDir = ensureSafeDirectoryPath(process.cwd(), './logs');
```

Notes

- `index.ts` is intentionally excluded from coverage as it only re-exports symbols.
- When adding new flags, update `args.ts` parsing options, normalization logic and add tests that ensure parse errors are translated into friendly `CliError` messages.
