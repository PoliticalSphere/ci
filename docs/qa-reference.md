# Q&A Reference Document

This document captures clarifying questions and answers gathered during the discovery
and development process. It serves as an authoritative, living source of truth to
guide subsequent decisions.

## Document Metadata

- **Created:** 2026-01-02
- **Owner:** DevOps Architect
- **Classification:** Internal
- **Purpose:** Capture policy, architecture, and governance decisions that cannot
  be resolved through external research alone

---

## Questions & Answers

### Q1: Which initiative should be tackled first?

**Date asked:** 2026-01-02  
**Status:** answered  
**Category:** governance

**Question:**
Given multiple identified gaps (evasion scanner, architectural totems, autofix-first gates,
audit & consolidation, consumer contract fix), what is the immediate priority and preferred
sequencing of work?

**Answer:**
Fix the consumer contract (`contract.json`) first to ensure it reflects actual infra repo
capabilities and does not reference irrelevant tooling (e.g., `vitest`/`playwright`). Then
proceed with:

1. Bounded audit & consolidation
2. Autofix-First local gates
3. Architectural Totems
4. Evasion & Complexity Scanner (after baselining)

**Implications:**

- Consumer contract must be corrected immediately to avoid false validation failures
- Audit should be scoped and time-bounded to prevent indefinite refactoring
- Complexity scanner requires baseline data, so it comes last after foundational work

---

### Q2: Consumer contract target scope

**Date asked:** 2026-01-02  
**Status:** answered  
**Category:** architecture

**Question:**
The `contract.json` file is designed to validate **consumer repositories** (the Political
Sphere application repos), not this infrastructure repo. The current contract requires:

- `vitest` and `playwright` as mandatory tooling
- Specific application source paths (`src`, `apps`, `packages`, `libs`)
- References to `PoliticalSphere/ci` workflows

Two clarifications needed:

1. **Does an application repository already exist?** If so, what is its actual tooling stack
   (e.g., does it use vitest/playwright, or something else)?
2. **Should the contract reflect aspirational requirements** (what you want consumers to have)
   or **current reality** (what the application repo actually uses today)?

**Answer:**
The contract must reflect **current reality first**, then evolve deliberately toward aspiration.
Correct choice is **(A) now**, with a clearly defined path to (B) later.

Key points:

1. The Political Sphere application repository **does exist** and is actively developed, but:
   - It is AI-authored and evolving
   - Tooling has not yet fully stabilised
   - Some tools referenced in `contract.json` (e.g., `vitest`, `playwright`) are not
     currently authoritative or universally adopted

2. `contract.json` is an **executable validation surface**, not a wish list:
   - It is a gate, not documentation
   - It is an enforcement artifact, not strategy prose
   - A contract that encodes aspiration instead of reality will generate false failures,
     bypass pressure, and silent erosion of trust

3. Correct model: **Reality-first contract + explicit evolution**
   - **Now:** Update `contract.json` to reflect what the current PS application repo
     actually uses and what can be safely enforced today
   - **Later:** Introduce aspirational requirements only when the app repo adopts them
     or there is an agreed migration plan, via versioned contract changes with
     documented migration windows

**Implications:**

- Must update `contract.json` to remove/adjust tooling requirements that are not actually
  in use in the application repo
- Aspirational policy must never be silently encoded in executable validation
- Future contract evolution requires explicit versioning and breaking-change documentation

---

### Q3: Actual tooling stack in the Political Sphere application repository

**Date asked:** 2026-01-02  
**Status:** answered  
**Category:** tooling

**Question:**
To update `contract.json` to reflect current reality, I need to know the **actual, current
state** of the Political Sphere application repository.

**Answer:**
Based on inspection of `PoliticalSphere/political-sphere` repository:

1. **Testing framework:** Vitest (confirmed via `vitest.config.ts`, `@vitest/coverage-v8`)
2. **E2E testing:** Playwright (confirmed via `playwright.config.ts`, `@playwright/test`, `@axe-core/playwright`)
3. **Linting/formatting:**
   - Biome for general/fast linting and formatting
   - ESLint for specialist/security linting (`eslint.config.js`, `@eslint/js`)
4. **TypeScript:** Yes (`tsconfig.json`, `tsconfig.base.json`, TypeScript 5.9.3)
5. **Package manager:** npm with `package-lock.json`
6. **Source structure:**
   - `apps/` (web, api, worker, e2e)
   - `libs/` (shared, game-engine, ui, testing, ai-system, etc.)
   - `tools/` (testing utilities, scripts)
7. **Additional tooling:**
   - Nx for monorepo management
   - Prisma for database
   - React for frontend
   - Commitlint for conventional commits

**Key insight:** The CI repo sets the standards and the platform must evolve accordingly.
The current contract already reflects the correct tooling (`vitest`, `playwright`, `eslint`,
`biome`, `typescript`) — these ARE in use in the application repo.

**Implications:**

- The contract tooling requirements are correct for the app repo
- The issue is that running the contract against THIS (CI) repo would fail, since this is
  infrastructure, not the application
- Need to ensure the contract is only validated against consumer app repos, not the CI repo itself
- May need to clarify which paths (`apps/`, `libs/`) are applicable

---

### Audit 1: Bounded Audit & Consolidation Results

**Date performed:** 2026-01-02  
**Status:** completed  
**Category:** maintenance

**Scope & Exit Conditions:**

| Dimension | Scope | Exit Condition | Result |
| --- | --- | --- | --- |
| Dead code | Unused exports, unreferenced files | `knip` reports 0 issues | ✅ PASSED |
| Duplication | Code clones >10 lines | `jscpd` reports 0 duplicatedLines | ✅ PASSED |
| Tool sprawl | Multiple tools for same purpose | Single tool per responsibility | ✅ PASSED |
| Config hygiene | Stale configuration entries | No stale entries remain | ✅ FIXED |

**Findings:**

1. **Dead Code (knip):** No unused exports or unreferenced files detected
2. **Duplication (jscpd):** Zero duplicated lines across all source files
3. **Tool Sprawl:** No overlapping tools detected. Clear separation:
   - Formatting: Biome only (no Prettier)
   - General linting: Biome (fast)
   - Security linting: ESLint + plugins (specialist)
   - Domain-specific: yamllint, markdownlint, shellcheck, hadolint, actionlint
4. **Config Hygiene:** Fixed `knip.json`:
   - Removed 8 stale `ignoreDependencies` entries that were no longer needed
   - Removed 2 project patterns with no matches (`configs/**/*.js`, `examples/**/*.js`)

**Actions Taken:**

- Updated `knip.json` to remove stale configuration entries
- Verified `npx knip` now reports "Excellent, Knip found no issues"

**Implications:**

- Codebase is clean with no dead code or duplication debt
- Tooling is well-organized with clear responsibility boundaries
- No major consolidation work required at this time

---

### Implementation 1: Autofix-First Local Gates

**Date implemented:** 2026-01-02  
**Status:** completed  
**Category:** developer-experience

**Problem:**
Pre-commit gates were failing on fixable issues (formatting, simple lint errors) that tools
could automatically correct. This created friction for developers who had to manually fix
formatting before committing.

**Solution:**
Implemented "autofix-first" pattern in the pre-commit gate:

1. **New helper function** `run_autofix` added to `gate-common.sh`:
   - Runs the autofix command (e.g., `biome --write`, `eslint --fix`)
   - Captures originally staged files before autofix
   - Re-stages any modified files after autofix completes
   - Logs autofix activity for traceability

2. **Modified pre-commit gate** (`gate-pre-commit.sh`):
   - Added autofix phase BEFORE lint checks
   - Runs autofix for: biome (--write), eslint (--fix), markdownlint (--fix)
   - Lint checks now run on already-fixed code

**Files Changed:**

- `tools/scripts/gates/gate-common.sh` - Added `run_autofix()` helper function
- `tools/scripts/gates/gate-pre-commit.sh` - Added autofix phase before lint checks

**Behaviour:**

```bash
Pre-commit hook flow:
1. Run autofix: biome --write, eslint --fix, markdownlint --fix
2. Re-stage any modified files
3. Run lint checks (on fixed code)
4. Run naming/secrets checks
```

**Implications:**

- Developers get automatic formatting/fixing on commit
- Only truly unfixable issues will fail the gate
- Reduced friction while maintaining code quality
- Logs capture what was auto-fixed for traceability

---
---

### Implementation 2: Architectural Totems

**Date implemented:** 2026-01-02  
**Status:** completed  
**Category:** governance

**Problem:**
No documented reference patterns for AI code generation or manual review. New files could
deviate from established conventions without clear guidance on what "correct" looks like.

**Solution:**
Created `docs/architectural-totems.md` documenting exemplar files (totems) for each file type:

**Totem Registry:**

| Type | Totem File | Purpose |
| --- | --- | --- |
| Gate Script | `tools/scripts/gates/gate-pre-commit.sh` | Bash gate entrypoint pattern |
| Lint Wrapper | `tools/scripts/lint/biome.sh` | Lint tool wrapper pattern |
| Shared Library | `tools/scripts/gates/gate-common.sh` | Bash helper library pattern |
| Reusable Workflow | `.github/workflows/_reusable-pr-gates.yml` | GitHub Actions workflow pattern |
| Test File | `tools/tests/consumer-contract.test.js` | JavaScript test pattern |
| Policy JSON | `configs/consumer/contract.json` | Versioned policy pattern |

**Pattern Requirements Documented:**

- Header structure for each file type
- Required metadata fields
- Organization conventions
- ShellCheck/ESLint directive patterns

**Usage Guidelines:**

1. AI code generation should reference appropriate totem
2. Manual review should verify totem pattern compliance
3. Totem updates should be swept to existing files

**Implications:**

- Clear reference for what "correct" looks like
- AI assistants can use totems as templates
- Reviewers have objective pattern to verify against
- Standards evolve by updating totems first

---

### Implementation 3: Evasion & Complexity Scanner

**Date implemented:** 2026-01-02  
**Status:** completed  
**Category:** governance

**Problem:**
No automated detection of lint evasion patterns (@ts-ignore, eslint-disable, etc.) or type
safety erosion (any types). These could accumulate over time without visibility.

**Solution:**
Created `tools/scripts/security/evasion-scan.js` - a Node.js scanner that:

1. **Detects evasion patterns:**
   - `@ts-ignore` - TypeScript error suppression (threshold: 0)
   - `@ts-expect-error` - Expected errors (no limit, for intentional test cases)
   - `eslint-disable` - ESLint rule suppression
   - `biome-ignore` - Biome rule suppression
   - `shellcheck disable` - Shell lint suppression
   - Type `any` usage - TypeScript safety erosion (threshold: 0)

2. **Produces structured output:**
   - Console report with summary and sample findings
   - JSON report at `reports/evasion/evasion-scan.json`
   - Non-zero exit code if thresholds exceeded

3. **Configurable thresholds:**
   - Strict (0) for @ts-ignore and any types
   - Unlimited for documented suppressions

**Baseline Established:**

| Pattern | Count | Threshold | Status |
|---------|-------|-----------|--------|
| @ts-ignore | 0 | 0 | ✓ Clean |
| @ts-expect-error | 0 | - | ✓ Clean |
| eslint-disable | 0 | - | ✓ Clean |
| biome-ignore | 0 | - | ✓ Clean |
| shellcheck disable | 10 | - | ✓ All with rationale |
| type any | 0 | 0 | ✓ Clean |

**Files Created:**

- `tools/scripts/security/evasion-scan.js` - Scanner implementation
- `reports/evasion/evasion-scan.json` - Output report

**Usage:**

```bash
npm run evasion-scan
```

**Implications:**

- Zero-tolerance for @ts-ignore and untyped any usage
- All existing shellcheck disables have rationale comments
- Scanner can be integrated into CI for regression detection
- Baseline established for future drift monitoring

---
