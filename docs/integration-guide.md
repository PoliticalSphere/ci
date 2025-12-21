# Integration Guide

This guide explains how PS application repositories consume the CI/CD platform.
It assumes GitHub Actions and GitHub-hosted runners.

## Prerequisites

- A GitHub repository within the Political Sphere organization.
- The ability to reference reusable workflows from this platform repo.
- Agreement to follow the CI policy in `docs/ci-policy.md`.

## Quick Start

1. Add a workflow in your application repo that calls the PR gate:

```yaml
name: PR Gates

on:
  pull_request:

permissions: {}

jobs:
  pr-gates:
    uses: org/ps-cicd-platform/.github/workflows/pr-gates.yml@vX.Y.Z
    permissions:
      contents: read
      pull-requests: write
```

1. Adopt the provided configurations in `/configs` or reference them directly.
2. Run local gates via Lefthook to match CI behavior.

## Reusable Workflows

- `pr-gates.yml` for PR validation and fast feedback.
- `security-scheduled.yml` for deep security scanning on a schedule.
- `build-artifacts.yml` for deterministic builds.
- `license-compliance.yml` for dependency license policy checks.
- `consumer-contract.yml` for consumer repository contract validation.
- `release.yml` for versioned releases (optional).

## Composite Actions

- Validation, linting, typing, tests, build, duplication checks.
- Shared helpers for structured output and banner display.

## Local Gates

- `lefthook install` to enable local hooks.
- Pre-commit: fast lint/validation.
- Pre-push: strict typing, tests, build.

## Support and Exceptions

- Policy exceptions must be logged in `docs/risk-decisions.md`.
- For deviations from secure defaults, document rationale and approval.
