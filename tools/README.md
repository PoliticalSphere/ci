# Tools

This directory contains **deterministic, non-interactive tooling** used by the
Political Sphere CI/CD platform.

All tooling here is **platform infrastructure**, not application logic.

---

## Purpose

The tools in this directory exist to:

- Provide **single, authoritative entry points** for local and CI execution
- Ensure **deterministic behaviour** across environments
- Produce **structured, readable output** for humans and AI
- Mirror CI behaviour as closely as practical when run locally

---

## Structure

- `/tools/scripts`
  - Operational scripts invoked by:
    - Lefthook (pre-commit / pre-push)
    - Reusable CI workflows
  - Scripts are the *only* place where execution logic lives.
  - Subfolders group scripts by purpose (branding, gates, lint, tasks, naming, ci, security, release).

- `/tools/tests`
  - Self-tests for:
    - Scripts
    - Composite actions
    - CI platform behaviour
  - Tests must be runnable locally and in CI.

Each subdirectory contains its own README describing:

- Purpose
- Inputs
- Outputs
- Invariants

---

## Mandatory Invariants

All tools **must** adhere to the following:

- **Non-interactive**  
  - Must run with `CI=1`
  - Must not prompt for input

- **Deterministic**  
  - No reliance on ambient environment state
  - No network access unless explicitly required and documented

- **Fail-fast**  
  - Scripts must use `set -euo pipefail` (or equivalent)
  - Failures must be explicit and actionable

- **Presentation-grade output**  
  - Political Sphere ASCII banner printed once per execution
  - Clear section headers
  - No noisy or unstructured logs

---

## Usage

- Scripts must be invoked via:
  - `bash <path>` for shell scripts
  - `node <path>` for Node.js scripts
- Scripts must **not** be sourced or executed implicitly.
- Behaviour must be identical whether invoked locally or in CI.

---

## Governance

- Do **not** duplicate logic across scripts.
- Shared behaviour must be factored into:
  - a single script, or
  - a composite action (if CI-only).
- Any deviation from these rules must be intentional and documented.

This directory is foundational infrastructure.
Changes here should be treated as **platform changes**, not routine edits.
