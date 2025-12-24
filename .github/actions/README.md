# Composite Actions

Shared, reusable composite actions for the Political Sphere CI/CD platform.
These actions are the single source of truth for CI behavior consumed by
workflows and downstream repositories.

---

## Purpose

Composite actions exist to:

- Eliminate duplicated logic across workflows
- Centralise security- and policy-sensitive behaviour
- Improve readability, auditability, and reuse
- Enable AI agents to reason about CI behaviour at a granular level
- Mitigate against script injection attacks

---

## Conventions (Mandatory)

- Each action lives in its **own directory**
- Each action **must** define an `action.yml` (or `action.yaml`)
- Actions are **deterministic**, **non-interactive**, and **CI-safe**
- Inputs and outputs must be **explicitly declared**
- Shared logic **must live here**, not duplicated across workflows

Every action must:

- Validate inputs where misuse is likely
- Emit a short **summary line** before execution
- Emit a clear **success line** on completion

---

## Design Invariants

All composite actions **must**:

- Be **SHA-pinnable** when consumed
- Operate under **least-privilege permissions**
- Avoid unsafe patterns (e.g. secret echoing, curl-pipe-to-shell)
- Emit **structured, actionable output**
- Fail fast and clearly on misconfiguration

Inline shell is allowed **only** where unavoidable and must be minimal.

---

## AI-First Design Commitments

Composite actions must be:

- **Discoverable**: clear naming and directory structure
- **Readable**: linear steps with rationale-focused comments
- **Operable**: runnable in isolation with documented inputs
- **Explainable**: predictable behaviour and clear failure modes

---

## Governance

This directory is **platform-critical**.
Changes here affect all consuming repositories and must preserve:

- determinism
- security baselines
- behavioural stability

Risky changes require an explicit, documented decision.

---

## Action Catalog

Baseline building blocks:

- `ps-banner`: print Political Sphere ASCII branding
- `ps-run`: standard banner + section wrapper for script execution
- `ps-checkout`: safe checkout wrapper with explicit fetch depth
- `ps-hardened-checkout`: harden runner + checkout in one step
- `ps-harden-runner`: step-security hardening with validated inputs
- `ps-upload-artifacts`: artifact upload with input validation
- `ps-pr-comment`: post PR comments with input validation
- `ps-write-summary`: write structured JSON summary artifacts
- `ps-preflight`: shared preflight checks for common requirements
- `ps-tools`: canonical tools installer supporting `bundle` (lint|security|none) and `extra_tools` (newline list); delegates to `ps-install-tools` for pinned installs
- `ps-install-tools`: legacy installer (deprecated). Use `ps-tools` as the canonical entrypoint for tool installation

Node toolchain:

- `ps-bootstrap`: standard workspace bootstrap (prepare HOME, platform checkout helpers)
- `ps-job-bootstrap`: canonical job preamble that runs `ps-harden-runner`, `ps-checkout`, optionally checks out the platform/`.ps-platform`, then runs `ps-bootstrap` (recommended as the default job start-up step)
- `ps-node-setup`: checkout + setup Node.js toolchain with optional deterministic installs (cache, npm ci)
- `ps-setup`: harden runner + node setup (single step). It is the canonical bootstrap entrypoint; supports optional dependency install (`install_dependencies` defaults to "0"), tool bundle install (`install_tools`, `tools_bundle`, `tools_extra`), and `working_directory` for monorepos.

Example: use `ps-setup` to run lint with installs/tools:

```yaml
- name: Setup (PS)
  uses: ./.github/actions/ps-setup
  with:
    node_version: ${{ inputs.node_version }}
    fetch_depth: ${{ inputs.fetch_depth }}
    cache: ${{ inputs.cache }}
    install_dependencies: "1"
    install_tools: "1"
    tools_bundle: "lint"
    skip_checkout: "1"
    skip_harden: "1"
```

Lint + quality:

- `lint`: run pre-commit gate
- `typecheck`: strict TypeScript typecheck
- `test`: deterministic unit test gate
- `jscpd`: duplication scanning
- `build`: deterministic build gate

Security:

- `ci-validate`: enforce CI policy validation
- `consumer-contract`: validate consumer repositories against contract policy
- `license-check`: license compliance against policy allowlists
- `secret-scan-pr`: fast gitleaks scan for PRs
- `semgrep-cli`: run Semgrep CLI and upload SARIF
- `ps-lint-tools`: convenience wrapper that calls `ps-tools` with `bundle: lint`
- `ps-security-tools`: convenience wrapper that calls `ps-tools` with `bundle: security`

---

## Testing and Guarantees

- Action contracts are validated by `tools/tests/actions.test.js`.
- Local and CI execution should match; any divergence must be documented.
- All external actions must remain SHA-pinned.

---

## Updating Actions

When changing or adding actions:

- Add or update headers to match the platform schema (purpose/scope/etc.).
- Update dependent workflow headers if dependencies change.
- Record any policy exceptions in `docs/risk-decisions.md`.

---

## Versioning Policy

Composite actions follow the repository versioning strategy in `docs/versioning.md`.
Changes must be recorded in `CHANGELOG.md` and treated as follows:

- **MAJOR**: breaking changes to inputs/outputs or behavior.
- **MINOR**: new inputs, new actions, or backward-compatible enhancements.
- **PATCH**: bug fixes and documentation-only changes.
