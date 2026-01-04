# Scripts

This directory contains **executable scripts** that implement the operational
behaviour of the Political Sphere CI/CD platform.

Scripts here are **authoritative execution units** used by:

- Local developer gates (Lefthook)
- Reusable CI workflows
- CI policy validation steps

They are designed to be **deterministic, non-interactive, and safe for AI-driven use**.

---

## Architecture

**See [`SEMANTIC_ARCHITECTURE.md`](./SEMANTIC_ARCHITECTURE.md) for comprehensive architecture documentation.**

The scripts directory implements a **layered, intentional architecture**:

- **Layer 0-1 (Core):** Foundation & Infrastructure - validation, logging, path handling
- **Layer 2 (Abstractions):** High-level frameworks - `runner-base.sh`, `security-runner-base.sh`
- **Layer 3 (Runners):** Tool-specific implementations - biome, eslint, gitleaks, etc.
- **Layer 4 (Actions):** GitHub Actions composites - bootstrap, task, teardown
- **Layer 5 (Gates/Workflows):** Orchestration - policy enforcement, CI workflows

Key principles:
- **Single source of truth** for each concern (validation, logging, path handling)
- **No duplication** across 3+ files (consolidate to `core/`)
- **Semantic naming** that reflects architectural layer and purpose
- **Facade pattern only for migration** (temporary backward compatibility)

---

## Purpose

Scripts in this directory exist to:

- Centralise execution logic (no inline CI logic duplication)
- Ensure local behaviour mirrors CI behaviour as closely as practical
- Provide predictable, structured outputs for humans and AI
- Enforce platform policy through code, not convention
- See `docs/terminal-output-standard.md` for the structured record format

---

## Structure

```
tools/scripts/
├── core/                  # Shared modules (single source of truth)
│   ├── bootstrap.sh       # Entry point - loads all core modules
│   ├── runner-base.sh     # High-level runner abstraction
│   ├── security-runner-base.sh  # Security scanner abstraction
│   ├── logging.sh         # Standardized logging
│   ├── validation.sh      # Input validation
│   ├── path-resolution.sh # Repo root discovery
│   └── ...                # See core/README.md for full list
│
├── branding/              # Output formatting and banners
│
├── actions/               # Composite action scripts
│   ├── ps-bootstrap/      # Bootstrap action scripts
│   ├── ps-task/           # Task runner scripts
│   └── ps-teardown/       # Cleanup scripts
│
├── gates/                 # Git hook entrypoints (Lefthook)
│   ├── common.sh          # Facade for gate helpers
│   ├── pre-commit.sh      # Pre-commit gate
│   └── pre-push.sh        # Pre-push gate
│
├── runners/               # Tool execution scripts
│   ├── lint/              # Linting tools (biome, eslint, etc.)
│   │   ├── common.sh      # Facade (delegates to core)
│   │   ├── biome.sh       # Biome runner
│   │   ├── eslint.sh      # ESLint runner
│   │   └── ...
│   └── security/          # Security scanners
│       ├── secret-scan-pr.sh
│       ├── gitleaks-history.sh
│       └── ...
│
├── workflows/             # CI workflow scripts
│   ├── ci/                # CI pipeline scripts
│   ├── consumer/          # Consumer contract checks
│   └── release/           # Release automation
│
└── naming/                # Naming policy enforcement
```

### Key Directories

- **core/** - Foundation modules. All reusable logic lives here.
  Use `runner-base.sh` for new tool runners.

- **runners/** - Tool execution scripts using the runner abstraction.
  Each script wraps one tool (biome, eslint, gitleaks, etc.).

- **gates/** - Local development gates (pre-commit, pre-push).
  Orchestrate runners and report results.

- **actions/** - Scripts supporting GitHub composite actions.

- **workflows/** - Scripts called directly from CI workflows.

---

## Mandatory Invariants

All scripts **must** adhere to the following rules:

- **Non-interactive**
  - Must run with `CI=1`
  - Must never prompt for user input

- **Deterministic**
  - No reliance on ambient shell state
  - No hidden network access unless explicitly required and documented

- **Fail-fast**
  - Bash scripts must start with:

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    ```

  - Node scripts must exit non-zero on failure

- **Presentation-grade output**
  - Political Sphere ASCII banner printed once per execution
  - Clear, consistent section headers
  - Actionable error messages (no raw stack dumps without context)
  - Structured `PS.LOG` records emitted for machine readers

---

## Conventions

- Scripts must be invoked explicitly:
  - `bash tools/scripts/<path>.sh`
  - `node tools/scripts/<path>.js`
- Scripts must **not** be sourced or executed implicitly.
- Shared behaviour must be factored into a single script or helper, not duplicated.

---

## Governance

- This directory is **platform-critical infrastructure**.
- Changes here affect all consumers (local and CI).
- Avoid overengineering, duplication, and parallel implementations.
- Any intentional exception to these rules must be documented.

Scripts are policy enforcement mechanisms.
Treat changes accordingly.
