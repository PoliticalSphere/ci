# Help (formatter & version)

This folder contains the canonical helpers used to render the CLI `--help`
output and to resolve the CLI `--version` string.

Files

- `formatter.ts` — formats the help message and sanitizes tokens (escape helpers).
- `help.ts` — reads package metadata (`package.json`) and implements `getPackageVersion()` / `showVersion()`.

Responsibilities

- Produce readable, deterministic help text that lists available linters (sanitized for safety).
- Sanitize linter ids / tokens to strip non-printable or control characters so the help output cannot contain terminal escape sequences or awkward control characters.
- Resolve package version in a safe, validated way and fall back to a sentinel (`unknown`) when package metadata is missing or invalid.

Key exports

- `showHelp()` — returns a formatted help string with available linters injected safely.
- `showVersion()` — returns a string like `@politicalsphere/ci v1.2.3` (falls back to `vunknown`).

Behavior & Security Notes

- The formatter sanitizes tokens using `escapeHelpToken` to remove non-printable and non-ASCII characters.
- `getPackageVersion()` validates that the resolved `package.json` path is within the repo root to avoid path traversal risks.
- Keep message templates immutable and perform substitutions at runtime to preserve readability and testability.

Testing guidance

- Unit-test help formatting by mocking the registry `getAllLinterIds()` with known inputs and asserting the rendered output contains or excludes expected tokens.
- Test sanitization using inputs that include control characters and emoji to ensure they are removed.
- Test version fallback by mocking `node:fs.readFileSync` to return empty or malformed JSON and assert `showVersion()` returns `vunknown`.

Examples

```ts
import { showHelp } from './formatter.ts';
import { showVersion } from './help.ts';

console.log(showHelp());
console.log(showVersion());
```

Maintenance tips

- Keep formatting logic in `formatter.ts` and package/version concerns in `help.ts` to preserve separation of concerns.
- When modifying help text layout, add tests that assert presence of core headings and linter list placeholder behavior.
