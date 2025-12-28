# Scripts

This directory contains **executable scripts** that implement the operational
behaviour of the Political Sphere CI/CD platform.

Scripts here are **authoritative execution units** used by:

- Local developer gates (Lefthook)
- Reusable CI workflows
- CI policy validation steps

They are designed to be **deterministic, non-interactive, and safe for AI-driven use**.

---

## Purpose

Scripts in this directory exist to:

- Centralise execution logic (no inline CI logic duplication)
- Ensure local behaviour mirrors CI behaviour as closely as practical
- Provide predictable, structured outputs for humans and AI
- Enforce platform policy through code, not convention
- See `docs/terminal-output-standard.md` for the structured record format.

---

## Structure

- `/tools/scripts/branding`
  - Output helpers (banner + section headers).

- `/tools/scripts/actions`
  - Composite action helper scripts (validation + orchestration).

- `/tools/scripts/gates`
  - Lefthook gate entrypoints and shared gate helpers.

- `/tools/scripts/lib`
  - Shared Node.js helpers for script IO/CLI behavior (non-executable).

- `/tools/scripts/lint`
  - Linting and formatting runners (Biome, ESLint, markdownlint, yamllint, etc.)
  - Each script is responsible for exactly one tool or gate.

- `/tools/scripts/tasks`
  - Core build/test/typecheck/duplication tasks.

- `/tools/scripts/naming`
  - Naming policy checks (script + JS validator).

- `/tools/scripts/ci`
  - CI policy validators (e.g. `validate-ci`)
  - These scripts enforce workflow, permissions, and supply-chain rules.

- `/tools/scripts/security`
  - Security and integrity helpers (SAST, secret scanning, supply-chain checks)
  - Used by both PR and scheduled workflows where applicable.

- `/tools/scripts/consumer`
  - Consumer contract checks for downstream repositories.

- `/tools/scripts/release`
  - Release automation helpers.

Each subdirectory contains its own README describing:

- Scope
- Inputs
- Outputs
- Failure modes

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
