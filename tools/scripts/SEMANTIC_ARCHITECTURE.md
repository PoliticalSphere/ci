# Semantic Architecture Guide

## Overview

The `tools/scripts/` directory implements a **layered, intentional architecture** that prioritizes clarity, reusability, and single-source-of-truth over convenience. This document defines the semantic structure and naming conventions for all scripts.

## Layers

### Layer 0: Foundation
**Purpose:** Bootstrapping and core utilities that all other scripts depend on.

**Scope:**
- `core/bootstrap.sh` - Single entry point that loads all dependencies
- `core/logging.sh` - Unified logging infrastructure
- `core/error-handler.sh` - Centralized error handling

**Semantics:**
- No script should directly source dependencies; use `bootstrap.sh`
- These files are **never called directly**; they export functions
- Guaranteed order of execution: config → logging → error-handler

### Layer 1: Infrastructure
**Purpose:** Reusable building blocks used by abstractions and runners.

**Scope:**
- `core/validation.sh` - **Single source of truth** for all input validation (booleans, enums, paths, patterns)
- `core/path-resolution.sh` - Git repo detection, path normalization
- `core/gha-helpers.sh` - GitHub Actions environment handling
- `core/branding/format.sh` - Output formatting and styling
- `core/time-helpers.sh` - Duration calculations, timestamps

**Semantics:**
- Functions in these modules are **reusable primitives**
- Naming pattern: `module_verb_noun` (e.g., `require_bool`, `normalize_path`)
- **Never duplicate functionality** across these files
- All action input validation must use `validation.sh` patterns

**Consolidation Rule:**
If you find similar validation logic in two places, move it to `core/validation.sh` with a new `require_*` function.

### Layer 2: Abstractions
**Purpose:** High-level frameworks that reduce boilerplate by 30-40%.

**Scope:**
- `core/runner-base.sh` - Framework for tool runners (linters, formatters, scanners)
- `core/security-runner-base.sh` - Framework for security scanning tools
- `core/action-input-validator.sh` - Framework for action input validation

**Semantics:**
- Each abstraction encapsulates a **specific pattern** (runner, security scanner, action input)
- Abstractions export a **consistent API** (e.g., `runner_init()`, `runner_exec()`)
- Abstractions handle lifecycle management (initialization, execution, reporting)
- **No duplication** between abstractions; they may extend each other
- Abstraction state is prefixed with scope (e.g., `RUNNER_`, `SECURITY_`)

**Design Rule:**
Before creating a new abstraction, verify that:
1. The pattern appears in 3+ existing scripts
2. The common code is 20+ lines
3. The abstraction can be used without domain-specific knowledge

### Layer 3: Runners
**Purpose:** Tool-specific implementations of abstractions.

**Scope:**
- `runners/lint/biome.sh` - Uses `runner-base.sh`
- `runners/lint/eslint.sh` - Uses `runner-base.sh`
- `runners/security/gitleaks-history.sh` - Uses `security-runner-base.sh`
- Plus 8+ additional lint and security runners

**Semantics:**
- Runners are typically **30-100 lines** (using abstractions)
- Runners are **never complex**; if logic is complex, move it to an abstraction
- Runners should be **self-contained in function**; no global mutable state
- Naming: `<type>/<tool>/<tool-name>.sh` (e.g., `runners/lint/eslint.sh`)

**Facade Pattern (Migration Only):**
- `runners/lint/common.sh` - **Temporary facade** for backward compatibility during refactoring
- Marked with clear deprecation notice
- **Should not be extended**; new runners should use abstractions directly
- Plan: Remove facade once all runners migrated

### Layer 4: Actions
**Purpose:** GitHub Actions composite action implementations.

**Scope:**
- `actions/ps-bootstrap/` - Comprehensive bootstrap for CI/CD pipeline
- `actions/*/action.yml` - Action definitions
- `actions/*/shared/` - Action-specific helpers (now consolidated)

**Semantics:**
- Actions orchestrate `runners/` and `core/` layers
- Actions use `action-input-validator.sh` for input normalization
- Shared helpers must be **minimal** and **action-specific**
- Shared helpers must **not duplicate** `core/` functionality
- Naming: If code is generic, move it to `core/`; if action-specific, document why

**Consolidation Rule:**
- `actions/*/shared/validate-inputs-common.sh` → Functions move to `core/action-input-validator.sh`
- `actions/*/shared/checkout-validate-common.sh` → Functions move to appropriate `core/` module
- Keep only **action-specific orchestration** in shared helpers

### Layer 5: Gates & Workflows
**Purpose:** Orchestration of complex multi-step processes.

**Scope:**
- `gates/` - Policy enforcement and pipeline control
- `workflows/` - Complex workflow patterns

**Semantics:**
- These are typically called by GitHub Actions workflows
- They compose `runners/` at a high level
- Minimal business logic; mostly orchestration

## Naming Conventions

### Reserved Names

| Name Pattern | Meaning | Usage | Example |
|---|---|---|---|
| `*-base.sh` | Abstraction/framework | Defines reusable patterns | `runner-base.sh`, `security-runner-base.sh` |
| `*-validator.sh` | Input validation | Validates inputs of specific type | `action-input-validator.sh` |
| `*-helpers.sh` | Utility functions | Low-level utilities (DEPRECATED for new code) | `gha-helpers.sh`, `time-helpers.sh` |
| `*-common.sh` | Facade/Backward compat | Migration aid only | `runners/lint/common.sh` (marked deprecated) |
| `bootstrap.sh` | Entry point | Single sourcing point | `core/bootstrap.sh` |
| `_*` prefix | Internal function | Not part of public API | `_runner_determine_mode()` |

### Semantic Naming Pattern

**For Functions:**
```
<scope>_<verb>_<noun>[_<qualifier>]
```

Examples:
- `runner_init` - Initialize runner
- `runner_require_config` - Require runner configuration
- `require_bool` - Require boolean validation (no scope; primitive)
- `safe_relpath_no_dotdot` - Safe relative path check (no scope; primitive)
- `security_set_baseline` - Set security baseline

**For Files:**
```
<layer>/<subcategory>/<name>.sh
```

Examples:
- `core/validation.sh` - Core infrastructure
- `runners/lint/eslint.sh` - Lint runner for eslint
- `actions/ps-bootstrap/action.yml` - Action definition
- `gates/pre-commit.sh` - Gate enforcement

## Anti-Patterns

### 🚫 Don't Create
- Generic `*-helpers.sh` for new code (consolidate into `core/validation.sh` or `core/branding/format.sh`)
- Action-specific validation (use `core/action-input-validator.sh` instead)
- New `common.sh` files (these are facades; consolidate to appropriate layer)
- Nested helper patterns (`runners/lint/helpers/helpers.sh` is wrong)
- Global mutable state outside of abstraction contexts (e.g., `LINT_RESULTS`, `SCAN_OUTPUT`)

### 🚫 Don't Duplicate
- Input validation (use `core/validation.sh`)
- Path handling (use `core/path-resolution.sh`)
- GitHub Actions helpers (use `core/gha-helpers.sh`)
- Formatted output (use `core/branding/format.sh`)

### 🚫 Don't Mix Concerns
- Don't put action logic in `runners/`
- Don't put generic validation in action-specific helpers
- Don't put formatting in validation
- Don't put business logic in abstractions (they're frameworks)

## Directory Structure with Semantics

```
tools/scripts/
│
├── core/                           [Layer 0-2: Foundation & Infrastructure]
│   ├── bootstrap.sh                # Layer 0: Entry point
│   ├── logging.sh                  # Layer 0: Logging
│   ├── error-handler.sh            # Layer 0: Error handling
│   ├── validation.sh               # Layer 1: Single source of truth for validation
│   ├── path-resolution.sh          # Layer 1: Path handling
│   ├── gha-helpers.sh              # Layer 1: GitHub Actions environment
│   ├── time-helpers.sh             # Layer 1: Time utilities
│   ├── runner-base.sh              # Layer 2: Runner abstraction
│   ├── security-runner-base.sh     # Layer 2: Security runner abstraction
│   ├── action-input-validator.sh   # Layer 2: Action input validation
│   ├── branding/
│   │   └── format.sh               # Layer 1: Output formatting
│   └── README.md                   # Architecture reference
│
├── runners/                        [Layer 3: Tool-specific runners]
│   ├── lint/
│   │   ├── biome.sh                # Concrete runner using runner-base
│   │   ├── eslint.sh               # Concrete runner using runner-base
│   │   ├── shellcheck.sh           # Concrete runner using runner-base
│   │   ├── common.sh               # Facade (DEPRECATED)
│   │   └── README.md
│   └── security/
│       ├── gitleaks-history.sh     # Concrete runner using security-runner-base
│       ├── secret-scan-pr.sh       # Concrete runner using security-runner-base
│       └── README.md
│
├── actions/                        [Layer 4: GitHub Actions composites]
│   ├── ps-bootstrap/
│   │   ├── action.yml              # Action definition
│   │   ├── index.sh                # Orchestration
│   │   ├── shared/                 # Action-specific orchestration ONLY
│   │   │   └── validate-inputs-common.sh  # CONSOLIDATING into core/action-input-validator.sh
│   │   └── README.md
│   └── [other-actions]/
│
├── gates/                          [Layer 5: Policy enforcement]
│   ├── pre-commit.sh
│   └── README.md
│
├── workflows/                      [Layer 5: Orchestration]
│   ├── workflow.sh
│   └── README.md
│
└── tests/                          [Testing layer - mirrors structure]
    ├── core.test.js
    ├── runner-base.test.sh
    └── ...
```

## Migration Path for Legacy Code

### Existing Lint Runners
| File | Current State | Target State | Timeline |
|---|---|---|---|
| `runners/lint/biome.sh` | Uses runner-base ✅ | Complete | Done |
| `runners/lint/eslint.sh` | Uses runner-base ✅ | Complete | Done |
| `runners/lint/shellcheck.sh` | Uses runner-base ✅ | Complete | Done |
| `runners/lint/yamllint.sh` | Uses facade | Use runner-base | Q2 |
| `runners/lint/hadolint.sh` | Uses facade | Use runner-base | Q2 |
| `runners/lint/markdownlint.sh` | Uses facade | Use runner-base | Q2 |

### Consolidation Targets
| Source Files | Target | Status |
|---|---|---|
| `actions/ps-bootstrap/shared/validate-inputs-common.sh` | `core/action-input-validator.sh` | In progress |
| `runners/lint/formatted-output-helpers.sh` | `core/branding/format.sh` | Pending |
| Multiple `common.sh` facades | Remove once runners migrated | Pending |

## Design Decisions

### Why This Structure?

1. **Layer 0 (Foundation):** Ensures every script has access to logging/errors without explicit sourcing
2. **Layer 1 (Infrastructure):** Prevents duplication of validation, path handling, and environment setup
3. **Layer 2 (Abstractions):** Reduces runner code by 30-40% and enables pattern enforcement
4. **Layer 3 (Runners):** Simple, focused tools that follow established patterns
5. **Layer 4 (Actions):** High-level orchestration using lower layers
6. **Layer 5 (Gates/Workflows):** Policy enforcement at the highest level

### Constraints & Principles

- **No circular dependencies:** Layer N can only use layers N-1 and below
- **Single source of truth:** Each concern has exactly one authoritative implementation
- **Minimal facade layer:** `common.sh` is a temporary migration aid, not a permanent pattern
- **Explicit over implicit:** Module names should describe their purpose clearly
- **Strict semantics:** Naming follows patterns; violations indicate architectural problems

## Verification & Enforcement

### Syntax Validation
All scripts validated with: `bash -n script.sh`

### Naming Conventions
Check for violations:
```bash
# Find new "common.sh" files (should not exist outside facade)
find tools/scripts -name "*common.sh" -not -path "*lint*"

# Find "helpers.sh" files (should consolidate)
find tools/scripts -name "*helpers.sh"

# Find internal functions not prefixed with "_"
grep -r "^function [a-z][a-z]*_[a-z]*_" tools/scripts/core/ | grep -v "^_"
```

### Layering Rules
- Runners should only import `core/runner-base.sh` or `core/security-runner-base.sh`
- Actions should import `core/bootstrap.sh` and specific validators
- No file in `runners/` should import from `actions/`

## When to Refactor

### Create a new module when:
- Pattern appears in 3+ files
- Common code is 20+ lines
- Pattern has clear boundaries

### Merge modules when:
- Files in same layer have <50% overlap
- Scope is clearly shared (e.g., all validation)
- No circular dependency would result

### Delete modules when:
- All consumers migrated to newer pattern
- Pattern no longer appears in codebase
- Functionality merged into higher-level abstraction

---

**Last Updated:** 2024
**Maintained By:** Political Sphere
**Review Cycle:** Quarterly with architecture team
