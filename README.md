# Political Sphere CI/CD Platform

This repository is the dedicated CI/CD, automation, and governance platform for Political Sphere (PS).
It is not an application repository. It provides secure-by-default, free-tooling-only CI/CD building
blocks that PS application repositories consume via reusable workflows and composite actions.

## Objectives

- Security-first defaults with least privilege and defense-in-depth.
- Deterministic, reproducible, and audit-ready pipelines.
- Fast PR feedback with heavier scans scheduled.
- Clear, structured outputs for humans and AI.
- AI-first design: discoverable, readable, operable, governable, composable.

## Authoritative Sources (Decision Anchors)

All workflows, scripts, and configurations are aligned with these sources.
If any deviation is required, it is documented with rationale.

- GitHub Actions Secure Use and Hardening
- GitHub Actions GITHUB_TOKEN and Permissions
- GitHub Code Scanning and SARIF Integration
- OpenSSF Scorecard Guidance
- GitHub Actions Security Well-Architected Guidance

## Repository Structure

- `/.github/workflows` reusable workflows via `workflow_call`
- `/.github/actions` composite actions for shared logic
- `/configs` policy and tool configuration (single source of truth)
- `/tools/scripts` deterministic, non-interactive scripts
- `/docs` governance, policy, and integration documentation
- `/branding` ASCII banner and usage rules
- `/examples` consumer examples and templates

Each major directory contains a README explaining purpose, inputs, outputs,
and invariants.

## Core Capabilities

- **Validate-CI gate** (must run first):
  - Enforces full SHA pinning for all actions
  - Requires explicit permissions at workflow and job levels
  - Blocks unsafe workflow patterns and unsafe secret handling
  - Flags inline bash where a composite action is appropriate
- **Reusable workflows**:
  - `pr-gates.yml` for fast PR validation
  - `security-scheduled.yml` for deep security scans
  - `build-artifacts.yml` for deterministic builds
  - `consumer-contract.yml` for consumer repo contract validation
  - `release.yml` (optional) for versioned releases
- **Local gates (Lefthook)**:
  - Pre-commit: fast lint and validation
  - Pre-push: strict typing, tests, build, duplication detection
  - Political Sphere ASCII branding in all hook output
- **Security scanning**:
  - Secrets: fast PR scan + scheduled history scan
  - SAST: CodeQL (where applicable) + Semgrep CE
  - Dependencies: Dependency Review + tuned npm audit
  - License compliance: dependency license allowlist/denylist policy
  - Supply chain: OpenSSF Scorecard
  - IaC/containers: Trivy (where applicable)

## Integration Model

PS application repositories will consume this platform by:

1. Referencing reusable workflows via `uses: org/repo/.github/workflows/...`
2. Using composite actions for common CI steps
3. Adopting the provided configs for linting and validation

The model is explicit and predictable: no hidden behavior, no implicit coupling.

## AI-First Design Commitments

- **Discoverable**: consistent structure and naming
- **Readable**: linear scripts with rationale-focused comments
- **Operable**: every task runnable locally and in CI
- **Governable**: policies and thresholds in config files
- **Explainable**: structured outputs and actionable errors

## Contributing and Change Control

- Single-source-of-truth configs, no duplicated logic.
- All changes must keep local behavior aligned with CI behavior.
- Risk decisions are tracked in a machine-discoverable log.

## Quickstart

- Prerequisites: Node.js **22.x** (use nvm or Volta to install and
  pin this version).
- Install dependencies: `npm install`
- Run lint, typecheck, tests, and duplication checks locally: `npm run preflight`
- Run individual checks as needed:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run jscpd`
- Reproduce `validate-ci` remote SHA verification locally:

```bash
PS_VALIDATE_CI_VERIFY_REMOTE=1 node tools/scripts/ci/validate-ci/index.js
```

See `SECURITY.md` and `CONTRIBUTING.md` for reporting and contribution
guidance. For PR checklist, see `.github/PULL_REQUEST_TEMPLATE.md`.

## Next Steps

The repository will be built using a strict single-file review loop.
After this README is approved, the next file will be created and reviewed.
