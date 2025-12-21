# CI Configs

This directory contains CI governance configuration files used by the platform
validation gate and reusable workflows.

## Structure

### policies/

- `policies/validate-ci.yml`: core validation policy rules for workflow safety.
- `policies/permissions-baseline.yml`: least-privilege permissions reference.
- `policies/unsafe-patterns.yml`: unsafe workflow patterns and remediation guidance.
- `policies/artifact-policy.yml`: artifact retention and upload policy.
- `policies/naming-policy.json`: naming conventions for key repo areas.

### exceptions/

- `exceptions/actions-allowlist.yml`: allowed action repositories (SHA-pinned only).
- `exceptions/unsafe-patterns-allowlist.yml`: approved exceptions with risk decisions.
- `exceptions/inline-bash-allowlist.yml`: approved inline-bash exceptions.
- `exceptions/high-risk-triggers-allowlist.yml`: approved high-risk workflow triggers.

## Usage

- These configs are consumed by `tools/scripts/ci/validate-ci/index.js`.
- Changes must be auditable and referenced in `docs/risk-decisions.md` when
  policy exceptions are introduced.
- Optional: set `PS_VALIDATE_CI_VERIFY_REMOTE=1` to verify action SHAs exist in
  remote repositories (requires network access).

## Design rationale

Action allowlists and unsafe-pattern rules are intentionally separate. The
allowlist answers "which actions are permitted at all," while unsafe-pattern
rules flag risky usage even for allowed actions. This defense-in-depth
separation keeps risk decisions explicit and auditable.

Local actions are permitted only under `.github/actions` and must include an
`action.yml` or `action.yaml` file, so usage remains predictable and auditable.
