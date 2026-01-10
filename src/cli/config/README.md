# Linter Registry

This module exports the authoritative linter registry (`LINTER_REGISTRY`) and
an efficient, runtime-protected map (`LINTER_MAP`) for O(1) lookups.

Usage guidance:

- Use `LINTER_MAP.get(id)` for frequent lookups by linter id (O(1)).
- Rely on `LINTER_REGISTRY` when you need a stable, ordered copy of the entries.
- Both the registry and the map are frozen/guarded to prevent accidental mutation.

Examples:

```ts
import { LINTER_MAP } from './linter-registry.ts';
const l = LINTER_MAP.get('eslint');
```

## Module exports (quick reference) ✅

- `LINTER_REGISTRY` — the authoritative, **ordered** array of linter entries (`LinterConfig[]`). Use when you need deterministic ordering (e.g., help output).
- `LINTER_MAP` — a runtime-protected `ReadonlyMap<string, LinterConfig>` for **O(1)** lookups by linter id.
- `getLinterById(id)` — convenience accessor that returns a `LinterConfig | undefined`.
- `getAllLinterIds()` — returns the linter ids in the registry order as `string[]`.
- `__test__assertValidRegistry(registry)` — **test-only** export that exposes the internal `assertValidRegistry` helper for unit tests; it is not part of the public runtime API (used to validate timeouts, uniqueness, expected version constraints, etc.).
- `LinterConfig` (type) — exported types/interfaces for consumers that construct or inspect linter entries.
- `ALLOWED_ENFORCEMENT` — list of allowed enforcement values (`advisory`, `blocking`, `security`).

> Tip: Prefer `LINTER_MAP` for frequent lookups and `LINTER_REGISTRY` for ordered iteration or UI rendering.

## See also 🔗

- [linter-registry.ts](./linter-registry.ts) — authoritative registry implementation and helpers (source).
- [linter-registry.test.ts](./linter-registry.test.ts) — tests covering registry invariants, ordering, and integration-style checks.
