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

permissions:
  contents: read

jobs:
  pr-gates:
    uses: PoliticalSphere/ci/.github/workflows/pr-gates.yml@v1.0.0
    permissions:
      contents: read
      # Uncomment for PR comments: pull-requests: write
    with:
      pr_number: ${{ github.event.pull_request.number }}
      pr_is_fork: ${{ github.event.pull_request.head.repo.fork }}
      pr_base_ref: ${{ github.event.pull_request.base.sha }}
      pr_head_ref: ${{ github.event.pull_request.head.sha }}
```

2. Adopt the provided configurations in `/configs` or reference them directly.
3. Run local gates via Lefthook to match CI behavior.

## Reusable Workflows

| Workflow | Purpose |
|----------|--------|
| `pr-gates.yml` | PR validation and fast feedback |
| `pr-checks.yml` | Full PR validation (lint, typecheck, test) |
| `pr-security.yml` | PR security scanning (secrets, dependencies) |
| `security-scheduled.yml` | Deep security scanning on a schedule |
| `build-artifacts.yml` | Deterministic builds |
| `license-compliance.yml` | Dependency license policy checks |
| `consumer-contract.yml` | Consumer repository contract validation |
| `validate-ci.yml` | CI policy compliance validation |
| `release.yml` | Versioned releases (optional) |

## Composite Actions

- Validation, linting, typing, tests, build, duplication checks.
- Shared helpers for structured output and banner display.
- See [Composite Actions Guide](composite-actions-guide.md) for details.

## Local Gates

- `lefthook install` to enable local hooks.
- Pre-commit: fast lint/validation.
- Pre-push: strict typing, tests, build.
- See [Local Development Guide](local-development.md) for setup.

## Support and Exceptions

- Policy exceptions must be logged in `docs/risk-decisions.md`.
- For deviations from secure defaults, document rationale and approval.
