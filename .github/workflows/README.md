# Workflows

Reusable GitHub Actions workflows for the Political Sphere CI/CD platform.
These workflows are policy-enforcing building blocks consumed by PS repositories.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WORKFLOW EXECUTION FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  Caller Workflow │
                              │  (pr-gates.yml)  │
                              └────────┬────────┘
                                       │
                                       ▼
                         ┌─────────────────────────┐
                         │  _reusable-pr-gates.yml │
                         └────────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
     ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
     │  Validate-CI   │     │   PR Security  │     │  Quality Gates │
     │  (MUST PASS)   │     │   (parallel)   │     │   (parallel)   │
     └────────┬───────┘     └────────────────┘     └────────────────┘
              │
              ▼
     ┌────────────────────────────────────────────────────────────────┐
     │  Downstream Jobs Execute ONLY if Validate-CI Passes            │
     │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
     │  │   Lint     │ │ Typecheck  │ │   Tests    │ │   Build    │  │
     │  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
     └────────────────────────────────────────────────────────────────┘
```

---

## Workflow Catalog

### Quick Reference

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `pr-gates.yml` | Fast PR validation (lint/type/test/build + secrets) | `pull_request` |
| `pr-checks.yml` | Orchestrator for PR Gates + License Compliance | `pull_request` |
| `pr-security.yml` | PR-scoped security checks (Gitleaks, dependencies) | `pull_request` |
| `validate-ci.yml` | CI policy gate (SHA pinning, permissions, patterns) | `workflow_call` |
| `security-scheduled.yml` | Deep security scans (CodeQL, Semgrep, Scorecard, Trivy) | `schedule` |
| `license-compliance.yml` | Dependency license policy checks | `workflow_call` |
| `consumer-contract.yml` | Consumer repository contract validation | `workflow_call` |
| `build-artifacts.yml` | Deterministic builds + artifact upload | `workflow_call` |
| `release.yml` | Git tag and GitHub Release creation | `workflow_dispatch` |

Reusable definitions live in `_reusable-*.yml`. The non-prefixed workflows are
callers that bind events to the reusable job definitions.

---

## Workflow Details

### PR Gates {#pr-gates}

**Purpose**: Fast, policy-aligned pull request validation with structured artifacts.
This is the canonical PR-time quality gate for Political Sphere consumers.

**Scope**:
- ✅ Enforce CI policy compliance via Validate-CI (blocking)
- ✅ Run lint, typecheck, tests, duplication detection, and build verification
- ✅ Delegate PR-scoped security checks to `pr-security.yml`
- ✅ Optionally run SonarCloud baseline analysis (non-blocking)
- ✅ Upload artifacts best-effort and publish structured summary
- ✅ Optionally post PR failure comment (non-fork PRs only, opt-in)
- ❌ Deep security scans (scheduled workflows handle this)
- ❌ Deploy, publish, or release artifacts

**Dependencies**:
- `_reusable-validate-ci.yml`
- `_reusable-pr-security.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-teardown/ps-finalize-workflow`
- `.github/actions/ps-task/*`

**Known Risks**:
- Fork PRs have comments disabled for security
- Sonar baseline is non-blocking and may fail silently

**References**: [docs/testing-strategy.md](../../docs/testing-strategy.md), [docs/risk-decisions.md#rd-pr-comments](../../docs/risk-decisions.md#rd-pr-comments)

---

### PR Checks {#pr-checks}

**Purpose**: Orchestration layer that runs PR Gates and License Compliance workflows
with explicit PR context.

**Scope**:
- ✅ Invoke PR Gates workflow for PR validation
- ✅ Invoke License Compliance workflow for OSS policy enforcement
- ✅ Pass PR context (number + base/head SHAs) to enable PR-scoped checks
- ✅ Apply least-privilege permissions and prevent unsafe PR comments on forks
- ❌ Implement lint/test/build logic directly (delegated to reusable workflows)
- ❌ Modify repository contents, deploy, publish, or release

**Dependencies**:
- `_reusable-pr-gates.yml`
- `_reusable-license-compliance.yml`

**Known Risks**:
- Fork PRs have comments disabled for security
- Secrets are not inherited (explicit pass-through only)

**References**: [docs/risk-decisions.md#rd-pr-comments](../../docs/risk-decisions.md#rd-pr-comments)

---

### PR Security {#pr-security}

**Purpose**: Focused PR-scoped security checks as a separate reusable workflow.
Follows the same design principles as PR Gates but narrows scope to security.

**Scope**:
- ✅ Enforce CI policy compliance via Validate-CI (blocking)
- ✅ Run fast secrets scanning (Gitleaks PR mode)
- ✅ Run dependency review for vulnerability detection
- ✅ Run OpenSSF Scorecard, Trivy, and TruffleHog scans
- ✅ Upload security artifacts and produce structured summary
- ❌ Run lint, typecheck, tests, or build verification
- ❌ Perform full-history security scans (scheduled workflow handles this)

**Dependencies**:
- `_reusable-validate-ci.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-teardown/ps-finalize-workflow`
- `.github/actions/ps-task/secret-scan-pr`
- `.github/actions/ps-task/security-dependency-review`
- `.github/actions/ps-task/scorecard`
- `.github/actions/ps-task/security-trivy`

**Known Risks**:
- Fork PRs may not have full dependency review context
- Secrets scan may produce false positives requiring baseline configuration

**References**: [docs/security-ci-policy.md](../../docs/security-ci-policy.md), [configs/security/gitleaks.toml](../../configs/security/gitleaks.toml)

---

### Validate CI {#validate-ci}

**Purpose**: Enforce CI policy compliance and publish evidence artifacts.
This workflow is designed to run **FIRST** in all calling workflows as a policy gate.

**Scope**:
- ✅ Checkout target repository + platform repository (for shared scripts/config)
- ✅ Optionally install dependencies in the target repo (for validation tooling)
- ✅ Optionally install dependencies in the platform repo (for platform tooling)
- ✅ Execute the Validate-CI policy gate
- ✅ Upload reports/logs as CI evidence
- ❌ Run lint/typecheck/tests/build
- ❌ Perform deep security scans
- ❌ Write to the repository or publish artifacts externally

**Dependencies**:
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-ci-validate`
- `.github/actions/ps-upload-artifacts`
- `tools/scripts/branding/print-section.sh`

**Known Risks**:
- Policy validation failure blocks all downstream jobs
- Remote SHA verification requires network access

**References**: [configs/ci/policies/](../../configs/ci/policies/), [docs/ci-policy-governance.md](../../docs/ci-policy-governance.md)

---

### Security Scheduled {#security-scheduled}

**Purpose**: Run scheduled, deep security scans and publish SARIF and supporting
artifacts for long-term security posture monitoring.

**Scope**:
- ✅ Enforce CI policy compliance (Validate-CI)
- ✅ Run full-history secrets scanning
- ✅ Run CodeQL static analysis
- ✅ Run Semgrep CE analysis
- ✅ Run OpenSSF Scorecard analysis
- ✅ Run Trivy filesystem security scanning
- ✅ Publish SARIF + evidence artifacts
- ✅ Produce a machine-readable summary
- ❌ Run tests or builds
- ❌ Deploy or publish artifacts

**Dependencies**:
- `_reusable-validate-ci.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-teardown/ps-finalize-workflow`
- `.github/actions/ps-task/security-codeql`
- `.github/actions/ps-task/semgrep-cli`
- `.github/actions/ps-task/secret-detection`
- `.github/actions/ps-task/scorecard`
- `.github/actions/ps-task/security-trivy`

**Known Risks**:
- Scheduled scans run on default branch only
- CodeQL and Semgrep may have rate limits on public runners
- Full-history scans can be slow on large repositories

**References**: [docs/security-ci-policy.md](../../docs/security-ci-policy.md), [configs/security/](../../configs/security/)

---

### License Compliance {#license-compliance}

**Purpose**: Enforce OSS license compliance using the platform policy file and
repository lockfile evidence. Produces audit-friendly reports.

**Scope**:
- ✅ Enforce CI policy compliance via Validate-CI
- ✅ Run license compliance checks against a declared policy + lockfile
- ✅ Upload reports/logs as evidence artifacts with controlled retention
- ✅ Publish a structured summary JSON
- ❌ Deploy, release, or publish packages
- ❌ Mutate repository state

**Dependencies**:
- `_reusable-validate-ci.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-teardown/ps-finalize-workflow`
- `.github/actions/ps-task/license-check`

**Known Risks**:
- Policy misconfigurations can block legitimate licenses
- Package transitive dependencies must be in lockfile

**References**: [configs/security/license-policy.yml](../../configs/security/license-policy.yml)

---

### Consumer Contract {#consumer-contract}

**Purpose**: Validate consumer repositories against the platform contract policy
and publish audit-friendly reports.

**Scope**:
- ✅ Enforce CI policy compliance via Validate-CI
- ✅ Run contract checks against policy + exceptions
- ✅ Upload reports/logs artifacts with controlled retention
- ❌ Deploy, release, or publish artifacts
- ❌ Modify repository state
- ❌ Run tests or quality gates (handled by PR Gates)

**Dependencies**:
- `_reusable-validate-ci.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-task/consumer-contract`
- `.github/actions/ps-teardown/ps-finalize-workflow`
- `tools/scripts/workflows/consumer/contract-check.sh`

**Known Risks**:
- Contract validation depends on correct manifest paths
- Breaking changes in contract require coordinated deployment

**References**: [docs/integration-guide.md](../../docs/integration-guide.md), [configs/consumer/contract.json](../../configs/consumer/contract.json)

---

### Build Artifacts {#build-artifacts}

**Purpose**: Build deterministic artifacts for consumer repositories and publish
them as CI evidence with controlled retention.

**Scope**:
- ✅ Enforce CI policy compliance via Validate-CI
- ✅ Perform a deterministic build in a clean environment
- ✅ Upload build artifacts with controlled retention
- ✅ Publish a structured, machine-readable summary
- ❌ Run tests or quality gates (handled by PR Gates)
- ❌ Perform deep security scans
- ❌ Publish packages or deploy artifacts

**Dependencies**:
- `_reusable-validate-ci.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-task/build`
- `.github/actions/ps-teardown/ps-finalize-workflow`
- `tools/scripts/actions/ps-build/build.sh`

**Known Risks**:
- Artifact retention duration limits storage costs
- Large artifacts can slow uploads/downloads

**References**: [docs/security-ci-policy.md](../../docs/security-ci-policy.md)

---

### Release {#release}

**Purpose**: Create a Git tag and GitHub Release in a controlled, policy-aligned
manner with dry-run mode support.

**Scope**:
- ✅ Enforce CI policy compliance via Validate-CI (blocking)
- ✅ Support safe DRY-RUN mode (validation + planning without mutation)
- ✅ Create a SemVer tag `v<release_version>` at the chosen ref (publish mode)
- ✅ Publish a GitHub Release (publish mode)
- ✅ Support release notes customisation (inline or file-based)
- ✅ Verify the published tag + release match the intended ref
- ✅ Upload evidence artifacts and structured summary
- ❌ Build artifacts, run tests, or publish packages/containers
- ❌ Deploy to environments

**Dependencies**:
- `_reusable-validate-ci.yml`
- `.github/actions/ps-bootstrap/ps-setup-standard`
- `.github/actions/ps-teardown/ps-finalize-workflow`

**Known Risks**:
- Accidental releases cannot be undone (use dry_run for validation)
- Release permissions require contents: write (scope carefully)
- Tag conflicts if manual tags exist

**References**: [docs/versioning.md](../../docs/versioning.md), [docs/risk-decisions.md#rd-release-permissions](../../docs/risk-decisions.md#rd-release-permissions)

---

## Mandatory Invariants

All workflows **must** comply with the following:

- **Reusable only**  
  Workflows are triggered via `workflow_call` (schedule/dispatch only where documented).

- **Validate-CI first**  
  The Validate-CI gate **must run before any other job**.

- **Least privilege**  
  Every workflow and job must declare explicit permissions and stay within the
  defined baseline unless a documented risk decision applies.

- **Full SHA pinning**  
  All `uses:` references must be pinned to full-length commit SHAs.

- **No unsafe patterns**  
  Disallowed workflow patterns (e.g. unsafe `pull_request_target` usage,
  credential persistence, curl-pipe-to-shell) must be blocked.

---

## Design Principles

- **Deterministic**: identical inputs produce identical outcomes
- **Non-interactive**: no prompts or manual intervention
- **Explainable**: clear, structured output and failure messages
- **Composable**: workflows are built from composite actions
- **Auditable**: behaviour is explicit and policy-validated

---

## AI-First Design Commitments

Workflows are written to be:

- **Discoverable**: predictable naming and layout
- **Readable**: linear jobs with clear intent
- **Operable**: runnable in isolation with documented inputs
- **Governable**: policy decisions live in config, not inline logic

---

## Governance

This directory is **platform-critical infrastructure**.

Changes here affect all consuming repositories and must preserve:

- security baselines
- behavioural stability
- determinism
- local/CI alignment

Risk-increasing changes require an explicit, documented decision.

---

## Security Scanning Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SECURITY SCANNING LAYERS                              │
└─────────────────────────────────────────────────────────────────────────────┘

  PR-TIME (Fast)                              SCHEDULED (Deep)
  ──────────────                              ────────────────
  
  ┌─────────────────────┐                    ┌─────────────────────┐
  │   pr-security.yml   │                    │ security-scheduled  │
  └──────────┬──────────┘                    └──────────┬──────────┘
             │                                          │
    ┌────────┴────────┐                       ┌────────┴────────┐
    │                 │                       │                 │
    ▼                 ▼                       ▼                 ▼
┌───────────┐  ┌──────────────┐       ┌──────────────┐  ┌──────────────┐
│ Gitleaks  │  │  Dependency  │       │   CodeQL     │  │   Semgrep    │
│ (PR mode) │  │    Review    │       │ (full repo)  │  │     CE       │
└───────────┘  └──────────────┘       └──────────────┘  └──────────────┘
                                              │                 │
                                              ▼                 ▼
                                      ┌──────────────┐  ┌──────────────┐
                                      │  Scorecard   │  │    Trivy     │
                                      │  (OpenSSF)   │  │ (filesystem) │
                                      └──────────────┘  └──────────────┘
                                              │                 │
                                              ▼                 ▼
                                      ┌─────────────────────────────┐
                                      │  SARIF → GitHub Security    │
                                      │      Alerts Dashboard       │
                                      └─────────────────────────────┘
```

---

## Permission Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PERMISSION ESCALATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

  WORKFLOW LEVEL (default)     →     JOB LEVEL (escalated)
  ────────────────────────           ─────────────────────
  
  permissions:                        permissions:
    contents: read     ───────►         contents: read
                                        pull-requests: write   ← Only for PR comments
                                        security-events: write ← Only for SARIF upload
                                        contents: write        ← Only for release.yml

  ┌──────────────────────────────────────────────────────────────────────────┐
  │  PRINCIPLE: Workflow defaults to read-only. Jobs escalate only when      │
  │  required for a specific operation. Fork PRs never receive write tokens. │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## Quickstart

### Basic Consumer Integration

```yaml
name: PR Gates
on:
  pull_request:
jobs:
  pr-gates:
    uses: PoliticalSphere/ci/.github/workflows/pr-gates.yml@<SHA>
    with:
      node_version: "22"
```

### Full PR Checks (with License Compliance)

```yaml
name: PR Checks
on:
  pull_request:
jobs:
  pr-checks:
    uses: PoliticalSphere/ci/.github/workflows/pr-checks.yml@<SHA>
    with:
      node_version: "22"
      pr_number: ${{ github.event.pull_request.number }}
      pr_is_fork: ${{ github.event.pull_request.head.repo.fork }}
      pr_base_ref: ${{ github.event.pull_request.base.sha }}
      pr_head_ref: ${{ github.event.pull_request.head.sha }}
```

### Scheduled Security Scans

```yaml
name: Security Scheduled
on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM
  workflow_dispatch:
jobs:
  security:
    uses: PoliticalSphere/ci/.github/workflows/security-scheduled.yml@<SHA>
    permissions:
      contents: read
      security-events: write
```

---

## Inputs and Outputs

Every workflow exposes explicit inputs and uploads structured artifacts.
The default artifact paths include `reports/**` and `logs/**`.

### Common Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `runner` | string | `ubuntu-22.04` | GitHub Actions runner label |
| `node_version` | string | `22` | Node.js major version |
| `fetch_depth` | number | `1` | Git fetch depth (0 = full history) |
| `cache` | string | `1` | Enable dependency caching |
| `platform_ref` | string | SHA | Platform repo ref for shared configs |
| `retention_days` | number | `7` | Artifact retention in days |

### Artifact Outputs

| Artifact | Content | Workflows |
|----------|---------|-----------|
| `reports/**` | Structured JSON/HTML reports | All |
| `logs/**` | Execution logs and traces | All |
| `coverage/**` | Test coverage reports | PR Gates |
| `sarif/**` | Security scan results | Security workflows |

---

## Dependency Policy

All external actions must be:

- SHA‑pinned to full commit SHAs
- Present in `configs/ci/exceptions/actions-allowlist.yml`
- Validated by `validate-ci`

```
External Action Verification:
┌─────────────────────────────────────────────────────────────────────────────┐
│  uses: actions/checkout@abc123...  ← Must be 40-char SHA, not tag/branch   │
│                                                                              │
│  Verified against:                                                           │
│    1. configs/ci/exceptions/actions-allowlist.yml (allowed list)            │
│    2. Remote GitHub API (SHA exists and matches)                            │
│    3. Policy rules (no curl-pipe-shell, no credential persist)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Testing

Workflows are validated by:

- `actionlint` (syntax + semantics)
- `validate-ci` (policy enforcement)
- `tools/tests/actions.test.js` (action catalog consistency)

Run locally:

```bash
npm run lint
```

---

## Related Documentation

- [Testing Strategy](../../docs/testing-strategy.md)
- [Security CI Policy](../../docs/security-ci-policy.md)
- [CI Policy Governance](../../docs/ci-policy-governance.md)
- [Risk Decisions](../../docs/risk-decisions.md)
- [Integration Guide](../../docs/integration-guide.md)
- [Versioning](../../docs/versioning.md)
