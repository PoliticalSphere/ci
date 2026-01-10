# Constants (CLI)

This folder contains constants used across the CLI implementation. Keep values here that are shared and static (paths, timeouts, durations, units).

Files

- `paths.ts` — small file/path and package-related constants (for example, `PKG_FILENAME`, `PKG_VERSION_FALLBACK`). Use this file for stable filename constants; add broader config or cache directory constants here only when their scope is well-defined and documented.
- `time.ts` — time-related constants (durations, timeouts). Use clear units (e.g., ms, s) in names or comments.

Guidelines

- Purpose: store static configuration values only; avoid embedding behavior here.
- Naming: prefer clear, explicit names (e.g., `DEFAULT_TIMEOUT_MS`, `CACHE_DIR`).
- Units: always document units in the constant name or via an inline comment.
- Tests: add unit or integration tests when a constant alters runtime behavior (timeouts, paths, etc.).
- Changes: update this README if new cross-cutting constants are added or guidelines change.

Examples

- Use `paths` for package and filename constants (e.g., `package.json` filenames). For config locations or cache directories prefer adding well-scoped constants and documenting their intended scope here.
- Use `time` for retry/backoff durations and operation timeouts.

## Import examples

```ts
// package/filename constants
import { PKG_FILENAME, PKG_VERSION_FALLBACK } from './paths.ts';

// time constants
import { MINUTE_MS, SECOND_MS } from './time.ts';
```

## Testing examples

```ts
// Example using Vitest to assert constant values
import { describe, it, expect } from 'vitest';
import { PKG_FILENAME, PKG_VERSION_FALLBACK } from './paths.ts';
import { MINUTE_MS, SECOND_MS } from './time.ts';

describe('constants', () => {
  it('paths: package filename defaults', () => {
    expect(PKG_FILENAME).toBe('package.json');
    expect(PKG_VERSION_FALLBACK).toBe('unknown');
  });

  it('time: MINUTE_MS is 60 * SECOND_MS', () => {
    expect(MINUTE_MS).toBe(60 * SECOND_MS);
  });
});
```

---

**Tip:** For large numbers of constants, consider grouping them by domain and exporting them as a single object for clearer imports.
