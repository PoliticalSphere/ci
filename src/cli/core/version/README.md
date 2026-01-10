# Version helper

This module implements safe package version resolution used by `--version` output.

Purpose

- Resolve the package version string from `package.json` in a safe, deterministic way.
- Validate that the resolved `package.json` path is within the repository root to prevent path traversal issues.
- Provide a stable fallback value when the package version cannot be read or is missing.

Key exports

- `getPackageVersion(): string` — returns the package version (e.g., `1.2.3`) or a fallback sentinel (`unknown`) when resolution fails.

Behavior & Security notes

- The helper validates resolved paths to ensure the discovered `package.json` is within the repo root. This prevents surprising resolutions that could point to files outside the project.
- If reading the file fails (I/O error, not found) or the JSON lacks a valid `version` string, the function returns a sentinel fallback (e.g., `unknown`). This keeps `showVersion()` safe for CI and offline workflows.
- Results are cached to avoid repeated file I/O and to keep output deterministic across multiple calls.

Testing guidance

- Unit tests should mock `node:fs.readFileSync` to exercise fallback and malformed JSON behavior.
- Add tests that assert the `getPackageVersion()` throws or returns a sensible fallback when the resolved path is outside the repo root.
- Prefer `vi.stubGlobal` / `vi.doMock` for dependable mocking across platforms.

Examples

```ts
import { getPackageVersion } from './version.ts';
console.log(`@politicalsphere/ci v${getPackageVersion()}`);
```

Maintenance tips

- Keep validation and file I/O isolated and testable (easy to mock).
- If changing the resolution strategy (e.g., looking up workspaces or monorepos), document the change and add tests for the new resolution rules.
