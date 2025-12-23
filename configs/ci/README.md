# CI Configs

This directory contains CI governance configuration files used by the platform
validation gate and reusable workflows.

## Structure

### policies/

- `policies/validate-ci.yml`: core validation policy rules for workflow safety.
- `policies/allowed-actions.yml`: approved action repositories (default deny).
- `policies/action-pinning.yml`: SHA-pinning requirements for remote actions.
- `policies/remote-sha-verify.yml`: remote SHA verification defaults.
- `policies/permissions-baseline.yml`: least-privilege permissions reference.
- `policies/high-risk-triggers.yml`: high-risk trigger allowlist + safeguards.
- `policies/harden-runner.yml`: runner hardening requirements + allowlist.
- `policies/inline-bash.yml`: inline shell constraints + allowlist.
- `policies/section-headers.yml`: section header requirements for run steps.
- `policies/secrets-handling.yml`: secrets hygiene expectations.
- `policies/local-actions.yml`: local action usage constraints.
- `policies/unsafe-patterns.yml`: unsafe workflow patterns and remediation guidance.
- `policies/unsafe-patterns-allowlist.yml`: approved exceptions with risk decisions.
- `policies/artifact-policy.yml`: artifact retention and upload policy.
- `policies/reproducible-installs.yml`: deterministic dependency install policy (documented).
- `policies/tooling-versions.yml`: pinned tooling versions policy (documented).
- `policies/logging-policy.yml`: logging safety policy (documented).
- `policies/naming-policy.json`: naming conventions for key repo areas.

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
