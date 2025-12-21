# CI Policy

This policy defines the mandatory CI controls for the Political Sphere CI/CD
platform and for all consumer repositories that adopt it.

It is intentionally strict: validation fails closed for quality and security.
Any exception must be explicitly documented.

## Policy Goals

- Enforce secure-by-default CI behavior.
- Ensure deterministic and reproducible pipelines.
- Prevent unsafe workflow patterns and secret exposure.
- Keep validation outputs structured and actionable.

## Non-Negotiable Controls

- **Validate-CI runs first** and blocks all other stages on failure.
- **Actions are SHA-pinned** to full-length commit SHAs.
- **Explicit permissions** at workflow and job levels.
- **Least privilege**: permissions must not exceed minimal scope.
- **Unsafe patterns blocked** (see `configs/ci/policies/unsafe-patterns.yml`).
- **Inline bash restricted**: prefer composite actions unless allowlisted.
- **Secrets handling explicit**: no implicit secret exposure.
- **Structured artifacts**: all checks emit logs and artifacts.

## Required CI Stages

- Validation: CI policy enforcement and workflow linting.
- Linting: code and config lint gates.
- Typing: strict TypeScript type checks where applicable.
- Tests: deterministic unit tests; integration/E2E optional.
- Build: deterministic builds where applicable.
- Security: secrets scan, SAST, dependency review, supply-chain checks.
- Consumer contract: declared toolchain and workflow usage validation.

## Workflow Requirements

- All workflows use `workflow_call` for reuse unless consumer-specific.
- Concurrency is defined for PR workflows to avoid duplicate runs.
- Runners are explicit and pinned to supported versions.
- Environment variables are explicit and minimal.
- Outputs are structured with section headers.

## Exceptions and Risk Decisions

Any deviation from this policy must be recorded in:

- `docs/risk-decisions.md`
- The relevant config allowlist in `/configs/ci`

Exceptions must include:

- Clear rationale
- Scope and impact
- Approval record
- Review/expiration date
