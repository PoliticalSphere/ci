# 🔧 Political Sphere Workflows

> **Reusable GitHub Actions workflows for the Political Sphere CI/CD platform.**  
> These workflows are policy-enforcing building blocks consumed by all PS repositories.

> 📖 See the [Vision Document](../../docs/VISION.md) for architectural philosophy.

---

## 📖 Table of Contents

- [Vision Alignment](#vision-alignment)
- [Architecture Overview](#architecture-overview)
- [Workflow Relationships](#workflow-relationships)
- [Workflow Catalog](#workflow-catalog)
- [Workflow Details](#workflow-details)
- [Mandatory Invariants](#mandatory-invariants)
- [Design Principles](#design-principles)
- [Security Scanning Architecture](#security-scanning-architecture)
- [Permission Model](#permission-model)
- [Quickstart](#quickstart)
- [Inputs and Outputs](#inputs-and-outputs)
- [Dependency Policy](#dependency-policy)
- [Testing](#testing)
- [Related Documentation](#related-documentation)

---

## Vision Alignment

These workflows implement the Vision's CI/CD Architectural Standard:

| Principle | Implementation |
|-----------|----------------|
| **Structural Isolation** | Workflows are externalized from game source code |
| **Immutable Gates** | Validate-CI enforces policy before any work executes |
| **SRP** | Caller/Reusable/Task separation of concerns |
| **DRY** | Shared logic in composite actions, not duplicated |
| **POLS** | Explicit, predictable execution paths |

---

## Architecture Overview

### High-Level Execution Flow

The platform follows a **caller → reusable → task** pattern. Event-triggered callers delegate to reusable workflows, which orchestrate composite actions (tasks).

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW EXECUTION MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│    EVENT TRIGGER              CALLER                 REUSABLE                       │
│    ─────────────              ──────                 ────────                       │
│                                                                                     │
│    pull_request  ──────────►  pr-checks.yml  ──────►  _reusable-pr-checks.yml       │
│                                     │                         │                     │
│                                     │                         ├──► Validate-CI      │
│                                     │                         ├──► Lint/Type/Test   │
│                                     │                         └──► Build            │
│                                     │                                               │
│    workflow_call ──────────►  pr-gates.yml   ──────►  _reusable-pr-gates.yml        │
│                                                               │                     │
│                                                               ├──► Validate-CI      │
│                                                               ├──► PR Security      │
│                                                               └──► Quality Gates    │
│                                                                                     │
│    schedule      ──────────►  security-scheduled.yml ──────►  Deep security scans   │
│    workflow_dispatch                                                                │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Job Dependency Flow

All workflows follow a **policy-first** execution model where `Validate-CI` acts as the blocking gate.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              JOB DEPENDENCY GRAPH                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│                               ┌──────────────────┐                                  │
│                               │   Validate-CI    │ ◄─── MUST PASS (blocking gate)   │
│                               │  (policy gate)   │                                  │
│                               └────────┬─────────┘                                  │
│                                        │                                            │
│            ┌───────────────────────────┼───────────────────────────┐                │
│            │                           │                           │                │
│            ▼                           ▼                           ▼                │
│   ┌────────────────┐         ┌────────────────┐         ┌────────────────┐          │
│   │  PR Security   │         │  Quality Gates │         │ License Check  │          │
│   │  (secrets,     │         │  (lint, type,  │         │  (OSS policy)  │          │
│   │   deps scan)   │         │   test, build) │         │                │          │
│   └────────────────┘         └────────┬───────┘         └────────────────┘          │
│                                       │                                             │
│                                       ▼                                             │
│                          ┌─────────────────────────┐                                │
│                          │  Finalize & Artifacts   │                                │
│                          │  (summary, upload)      │                                │
│                          └─────────────────────────┘                                │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow Relationships

Understanding how workflows connect is critical for consumers and maintainers.

### PR Checks vs PR Gates

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          PR CHECKS vs PR GATES                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   PR CHECKS (Event-Triggered)              PR GATES (Reusable)                      │
│   ────────────────────────────             ───────────────────                      │
│                                                                                     │
│   ┌───────────────────────┐               ┌───────────────────────┐                 │
│   │     pr-checks.yml     │               │     pr-gates.yml      │                 │
│   │                       │               │                       │                 │
│   │  Trigger: pull_request│               │  Trigger: workflow_call│                │
│   │  (opened, reopened,   │               │  (called by other     │                 │
│   │   synchronize)        │               │   workflows)          │                 │
│   │                       │               │                       │                 │
│   │  Skips: docs-only PRs │               │  Configurable inputs  │                 │
│   └───────────┬───────────┘               │  for all runtime      │                 │
│               │                           │  parameters           │                 │
│               │ calls                     └───────────┬───────────┘                 │
│               ▼                                       │ calls                       │
│   ┌───────────────────────┐               ┌───────────▼───────────┐                 │
│   │ _reusable-pr-checks   │               │ _reusable-pr-gates    │                 │
│   │                       │               │                       │                 │
│   │  • Fixed defaults     │               │  • Full configurability│                │
│   │  • PR context auto-   │               │  • Artifact paths     │                 │
│   │    detected           │               │  • Retention days     │                 │
│   │  • Fork-aware         │               │  • Sonar integration  │                 │
│   └───────────────────────┘               └───────────────────────┘                 │
│                                                                                     │
│   USE CASE: Direct PR trigger             USE CASE: Called from other workflows,    │
│   with auto-detected context              custom integrations, or manual dispatch   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Complete Workflow Topology

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE WORKFLOW TOPOLOGY                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐    │
│   │ CALLERS     │      │ REUSABLE    │      │ ACTIONS     │      │ SCRIPTS     │    │
│   │ (triggers)  │──────│ (logic)     │──────│ (tasks)     │──────│ (execution) │    │
│   └─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘    │
│                                                                                     │
│   pr-checks.yml ───────► _reusable-pr-checks.yml                                    │
│        │                        │                                                   │
│        │                        ├──► ps-bootstrap/ps-setup-standard                 │
│        │                        ├──► ps-task/lint, ps-task/typecheck, ...           │
│        │                        └──► ps-teardown/ps-finalize-workflow               │
│        │                                                                            │
│   pr-gates.yml ────────► _reusable-pr-gates.yml                                     │
│        │                        │                                                   │
│        │                        ├──► _reusable-validate-ci.yml (blocking)           │
│        │                        ├──► _reusable-pr-security.yml (parallel)           │
│        │                        └──► Quality gate tasks (parallel)                  │
│        │                                                                            │
│   pr-security.yml ─────► _reusable-pr-security.yml                                  │
│        │                        │                                                   │
│        │                        ├──► ps-task/secret-scan-pr                         │
│        │                        ├──► ps-task/security-dependency-review             │
│        │                        └──► ps-task/security-trivy                         │
│        │                                                                            │
│   security-scheduled ──► Deep scans (CodeQL, Semgrep, Scorecard, Trivy)             │
│        │                                                                            │
│   license-compliance ──► _reusable-license-compliance.yml                           │
│        │                                                                            │
│   consumer-contract ───► Contract validation                                        │
│        │                                                                            │
│   build-artifacts ─────► Deterministic build + upload                               │
│        │                                                                            │
│   release.yml ─────────► Tag creation + GitHub Release                              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow Catalog

### Quick Reference

| Workflow | Type | Purpose | Trigger |
|----------|------|---------|---------|
| `pr-checks.yml` | Caller | PR event entrypoint → runs PR validation | `pull_request` |
| `pr-gates.yml` | Caller | Reusable PR validation wrapper | `workflow_call` |
| `pr-security.yml` | Caller | PR-scoped security checks | `workflow_call` |
| `validate-ci.yml` | Caller | CI policy gate (runs first, always) | `workflow_call` |
| `security-scheduled.yml` | Caller | Deep security scans on schedule | `schedule` |
| `license-compliance.yml` | Caller | Dependency license policy checks | `workflow_call` |
| `consumer-contract.yml` | Caller | Consumer repository contract validation | `workflow_call` |
| `build-artifacts.yml` | Caller | Deterministic builds + artifact upload | `workflow_call` |
| `release.yml` | Caller | Git tag and GitHub Release creation | `workflow_dispatch` |

### Naming Convention

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              FILE NAMING PATTERN                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   CALLERS (event triggers)           REUSABLES (implementation)                     │
│   ────────────────────────           ──────────────────────────                     │
│                                                                                     │
│   pr-checks.yml            ────────►  _reusable-pr-checks.yml                       │
│   pr-gates.yml             ────────►  _reusable-pr-gates.yml                        │
│   pr-security.yml          ────────►  _reusable-pr-security.yml                     │
│   validate-ci.yml          ────────►  _reusable-validate-ci.yml                     │
│   license-compliance.yml   ────────►  _reusable-license-compliance.yml              │
│                                                                                     │
│   PATTERN:                                                                          │
│   • Callers: <name>.yml (binds events to reusable)                                  │
│   • Reusables: _reusable-<name>.yml (contains actual logic)                         │
│   • Underscore prefix (_) = internal, not called directly by consumers              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow Details

### PR Checks {#pr-checks}

> **The main PR entrypoint.** Fires on `pull_request` events and delegates to reusable workflows.

**Trigger**: `pull_request` (opened, reopened, synchronize)

**What it does**:
```
pull_request event
       │
       ▼
┌──────────────────┐
│  pr-checks.yml   │  ◄── Skips docs-only changes via paths-ignore
└────────┬─────────┘
         │
         │  calls with PR context
         ▼
┌──────────────────────────────┐
│  _reusable-pr-checks.yml     │
│                              │
│  • Auto-detects PR number    │
│  • Detects fork PRs          │
│  • Disables comments on forks│
│  • Fixed runtime defaults    │
└──────────────────────────────┘
```

**Scope**:
- ✅ Trigger on PR lifecycle events (open/reopen/push)
- ✅ Skip docs-only changes to save compute
- ✅ Pass PR context (number, base/head SHAs, fork detection)
- ✅ Disable unsafe PR comments on fork PRs
- ❌ Implement checks directly (delegated)

**Dependencies**: `_reusable-pr-checks.yml`

---

### PR Gates {#pr-gates}

> **The reusable PR validation wrapper.** Called by other workflows via `workflow_call`.

**Trigger**: `workflow_call` (internal reusable)

**What it does**:
```
Another workflow calls pr-gates.yml
              │
              │  with configurable inputs:
              │  • runner, node_version, fetch_depth
              │  • artifact_paths, coverage_paths
              │  • retention_days, platform_ref
              │  • pr_number, pr_is_fork, etc.
              ▼
   ┌──────────────────┐
   │  pr-gates.yml    │
   └────────┬─────────┘
            │
            │  forwards all inputs
            ▼
   ┌──────────────────────────┐
   │ _reusable-pr-gates.yml   │
   │                          │
   │  • Validate-CI (first)   │
   │  • PR Security (parallel)│
   │  • Quality gates:        │
   │    - Lint                │
   │    - Typecheck           │
   │    - Tests               │
   │    - Build               │
   │  • Sonar (optional)      │
   │  • Artifact upload       │
   └──────────────────────────┘
```

**Scope**:
- ✅ Forward caller inputs to reusable workflow
- ✅ Full configurability (runtime, artifacts, PR context)
- ✅ Secret passthrough (Node auth, Sonar tokens)
- ❌ Listen to PR events directly (callers do this)

**Dependencies**: `_reusable-pr-gates.yml`, `_reusable-validate-ci.yml`, `_reusable-pr-security.yml`

**References**: [docs/testing-strategy.md](../../docs/testing-strategy.md), [docs/risk-decisions.md#rd-pr-comments](../../docs/risk-decisions.md#rd-pr-comments)

---

### PR Security {#pr-security}

> **Fast, PR-scoped security checks.** Runs secrets scanning and dependency review.

**Trigger**: `workflow_call`

**What it does**:
```
┌─────────────────────────────────────────┐
│           pr-security.yml               │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌──────────┐
│Gitleaks│   │Dependency│   │  Trivy   │
│PR mode │   │  Review  │   │  Scan    │
└────────┘   └──────────┘   └──────────┘
    │              │              │
    └──────────────┼──────────────┘
                   ▼
           ┌────────────┐
           │   SARIF    │
           │  Artifacts │
           └────────────┘
```

**Scope**:
- ✅ Gitleaks secrets scanning (PR mode - fast)
- ✅ Dependency review for vulnerabilities
- ✅ Trivy filesystem scan
- ✅ OpenSSF Scorecard
- ❌ Full-history scans (scheduled workflow handles this)
- ❌ Lint, tests, or builds

**Dependencies**: `_reusable-validate-ci.yml`, `ps-task/secret-scan-pr`, `ps-task/security-dependency-review`, `ps-task/security-trivy`

**References**: [docs/security-ci-policy.md](../../docs/security-ci-policy.md), [configs/security/gitleaks.toml](../../configs/security/gitleaks.toml)

---

### Validate CI {#validate-ci}

> **The policy gate.** Runs FIRST in all workflows. Blocks downstream jobs on failure.

**Trigger**: `workflow_call`

**What it does**:
```
┌─────────────────────────────────────────────────────────────────┐
│                     VALIDATE-CI GATE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│   │  Checkout   │───►│  Validate   │───►│  Evidence   │         │
│   │  target +   │    │  CI Policy  │    │  Upload     │         │
│   │  platform   │    │  Gate       │    │             │         │
│   └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                             │                                   │
│                      ┌──────┴──────┐                            │
│                      │             │                            │
│                      ▼             ▼                            │
│                   ✅ PASS       ❌ FAIL                          │
│                      │             │                            │
│                      ▼             ▼                            │
│               Downstream      ALL JOBS                          │
│               jobs run        BLOCKED                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Policy Checks:
  • SHA pinning verification (all uses: must be 40-char SHAs)
  • Permissions validation (least-privilege enforcement)
  • Forbidden patterns (no curl-pipe-shell, no credential persist)
  • Action allowlist verification
```

**Scope**:
- ✅ Checkout target repo + platform repo (shared scripts/config)
- ✅ Execute CI policy validation
- ✅ Upload reports/logs as evidence
- ❌ Run lint, tests, builds, or security scans

**Dependencies**: `ps-bootstrap/ps-setup-standard`, `ps-ci-validate`, `ps-upload-artifacts`

**References**: [configs/ci/policies/](../../configs/ci/policies/), [docs/ci-policy-governance.md](../../docs/ci-policy-governance.md)

---

### Security Scheduled {#security-scheduled}

> **Deep security scans on schedule.** Runs comprehensive analysis nightly/weekly.

**Trigger**: `schedule`, `workflow_dispatch`

**What it does**:
```
┌─────────────────────────────────────────────────────────────────┐
│                  SCHEDULED SECURITY SCANS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Daily/Weekly Schedule                                         │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────┐                                              │
│   │ Validate-CI  │ (blocking)                                   │
│   └──────┬───────┘                                              │
│          │                                                      │
│   ┌──────┴──────────────────────────────────┐                   │
│   │              │              │           │                   │
│   ▼              ▼              ▼           ▼                   │
│ ┌──────┐    ┌────────┐    ┌────────┐   ┌────────┐               │
│ │CodeQL│    │Semgrep │    │Gitleaks│   │ Trivy  │               │
│ │ SAST │    │  CE    │    │ (full) │   │  FS    │               │
│ └──────┘    └────────┘    └────────┘   └────────┘               │
│      │           │             │            │                   │
│      └───────────┴──────┬──────┴────────────┘                   │
│                         ▼                                       │
│                  ┌────────────┐                                 │
│                  │  OpenSSF   │                                 │
│                  │ Scorecard  │                                 │
│                  └──────┬─────┘                                 │
│                         ▼                                       │
│              ┌─────────────────────┐                            │
│              │ SARIF → GitHub      │                            │
│              │ Security Dashboard  │                            │
│              └─────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Scope**:
- ✅ Full-history secrets scanning
- ✅ CodeQL static analysis (SAST)
- ✅ Semgrep CE analysis
- ✅ OpenSSF Scorecard
- ✅ Trivy filesystem scanning
- ✅ SARIF upload to GitHub Security
- ❌ Tests, builds, or deployments

**Dependencies**: `_reusable-validate-ci.yml`, `ps-task/security-codeql`, `ps-task/semgrep-cli`, `ps-task/secret-detection`, `ps-task/scorecard`, `ps-task/security-trivy`

**References**: [docs/security-ci-policy.md](../../docs/security-ci-policy.md), [configs/security/](../../configs/security/)

---

### License Compliance {#license-compliance}

> **OSS license policy enforcement.** Checks dependencies against allowed licenses.

**Trigger**: `workflow_call`

**Scope**:
- ✅ Validate-CI enforcement (blocking)
- ✅ License compliance checks against policy + lockfile
- ✅ Evidence artifact upload
- ❌ Deploy, release, or publish

**Dependencies**: `_reusable-validate-ci.yml`, `ps-task/license-check`

**References**: [configs/security/license-policy.yml](../../configs/security/license-policy.yml)

---

### Consumer Contract {#consumer-contract}

> **Contract validation for consumer repos.** Ensures consumers follow platform requirements.

**Trigger**: `workflow_call`

**Scope**:
- ✅ Validate-CI enforcement (blocking)
- ✅ Contract checks against policy + exceptions
- ✅ Evidence artifact upload
- ❌ Tests, builds, or quality gates (handled by PR Gates)

**Dependencies**: `_reusable-validate-ci.yml`, `ps-task/consumer-contract`, `tools/scripts/workflows/consumer/contract-check.sh`

**References**: [docs/integration-guide.md](../../docs/integration-guide.md), [configs/consumer/contract.json](../../configs/consumer/contract.json)

---

### Build Artifacts {#build-artifacts}

> **Deterministic builds.** Creates reproducible artifacts for release.

**Trigger**: `workflow_call`

**Scope**:
- ✅ Validate-CI enforcement (blocking)
- ✅ Deterministic build in clean environment
- ✅ Artifact upload with controlled retention
- ❌ Tests or security scans
- ❌ Publish packages or deploy

**Dependencies**: `_reusable-validate-ci.yml`, `ps-task/build`, `tools/scripts/actions/ps-build/build.sh`

**References**: [docs/security-ci-policy.md](../../docs/security-ci-policy.md)

---

### Release {#release}

> **Git tag and GitHub Release creation.** Supports dry-run mode for safe validation.

**Trigger**: `workflow_dispatch`

**What it does**:
```
┌─────────────────────────────────────────────────────────────────┐
│                      RELEASE WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Manual Trigger (workflow_dispatch)                            │
│          │                                                      │
│          ├── release_version: "1.2.3"                           │
│          ├── dry_run: true/false                                │
│          └── release_notes: "..."                               │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────┐                                              │
│   │ Validate-CI  │ (blocking)                                   │
│   └──────┬───────┘                                              │
│          │                                                      │
│   ┌──────┴──────┐                                               │
│   │             │                                               │
│   ▼             ▼                                               │
│ DRY RUN      PUBLISH                                            │
│   │             │                                               │
│   ▼             ▼                                               │
│ ┌──────┐    ┌─────────────┐                                     │
│ │Validate│   │Create tag   │                                    │
│ │only    │   │v<version>   │                                    │
│ └──────┘    └──────┬──────┘                                     │
│                    ▼                                            │
│              ┌─────────────┐                                    │
│              │Create GitHub│                                    │
│              │Release      │                                    │
│              └──────┬──────┘                                    │
│                     ▼                                           │
│              ┌─────────────┐                                    │
│              │Verify tag + │                                    │
│              │release match│                                    │
│              └─────────────┘                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Scope**:
- ✅ Dry-run mode for safe validation
- ✅ Create SemVer tag `v<version>`
- ✅ Publish GitHub Release
- ✅ Custom release notes (inline or file)
- ❌ Build artifacts, tests, or container publishing
- ❌ Deploy to environments

**Dependencies**: `_reusable-validate-ci.yml`, `ps-bootstrap/ps-setup-standard`, `ps-teardown/ps-finalize-workflow`

**References**: [docs/versioning.md](../../docs/versioning.md), [docs/risk-decisions.md#rd-release-permissions](../../docs/risk-decisions.md#rd-release-permissions)

---

## Mandatory Invariants

All workflows **must** comply with these non-negotiable rules:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           MANDATORY INVARIANTS                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  1️⃣  REUSABLE ONLY                                                                   │
│      Workflows trigger via workflow_call (schedule/dispatch only where documented)  │
│                                                                                      │
│  2️⃣  VALIDATE-CI FIRST                                                               │
│      The policy gate MUST run before any other job                                  │
│                                                                                      │
│  3️⃣  LEAST PRIVILEGE                                                                 │
│      Explicit permissions required; escalate only with documented risk decision    │
│                                                                                      │
│  4️⃣  FULL SHA PINNING                                                                │
│      All uses: references must be 40-character commit SHAs                          │
│      ❌ uses: actions/checkout@v4                                                    │
│      ✅ uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683             │
│                                                                                      │
│  5️⃣  NO UNSAFE PATTERNS                                                              │
│      Blocked: unsafe pull_request_target, credential persist, curl-pipe-shell      │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            DESIGN PRINCIPLES                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   DETERMINISTIC        Identical inputs → identical outcomes                        │
│   ─────────────        No flaky tests, no network-dependent defaults               │
│                                                                                      │
│   NON-INTERACTIVE      No prompts, no manual intervention                           │
│   ───────────────      Fully automated from trigger to completion                   │
│                                                                                      │
│   EXPLAINABLE          Clear, structured output and failure messages                │
│   ───────────          Easy to debug, easy to understand                            │
│                                                                                      │
│   COMPOSABLE           Workflows built from reusable composite actions              │
│   ──────────           Mix and match components as needed                           │
│                                                                                      │
│   AUDITABLE            Behaviour is explicit and policy-validated                   │
│   ─────────            Evidence artifacts for compliance review                     │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### AI-First Design Commitments

Workflows are written to be:

| Principle | Description |
|-----------|-------------|
| **Discoverable** | Predictable naming and layout for easy navigation |
| **Readable** | Linear jobs with clear intent, well-commented |
| **Operable** | Runnable in isolation with documented inputs |
| **Governable** | Policy decisions live in config, not inline logic |

---

## Governance

> ⚠️ This directory is **platform-critical infrastructure**.

Changes here affect all consuming repositories and must preserve:

- 🔒 Security baselines
- 🔄 Behavioural stability
- 🎯 Determinism
- 🏠 Local/CI alignment

**Risk-increasing changes require an explicit, documented decision in [docs/risk-decisions.md](../../docs/risk-decisions.md).**

---

## Security Scanning Architecture

The platform uses a **two-tier security model**: fast PR-time checks for immediate feedback, and comprehensive scheduled scans for deep analysis.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY SCANNING TIERS                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   TIER 1: PR-TIME (Fast)                    TIER 2: SCHEDULED (Deep)                │
│   ──────────────────────                    ────────────────────────                │
│                                                                                      │
│   Purpose: Immediate feedback               Purpose: Comprehensive analysis          │
│   Latency: < 5 minutes                      Latency: 15-60 minutes                  │
│   Scope: Changed files only                 Scope: Full repository                  │
│                                                                                      │
│   ┌─────────────────────┐                  ┌─────────────────────┐                  │
│   │   pr-security.yml   │                  │ security-scheduled  │                  │
│   └──────────┬──────────┘                  └──────────┬──────────┘                  │
│              │                                        │                              │
│   ┌──────────┴──────────┐                  ┌─────────┴─────────────────┐            │
│   │                     │                  │              │            │            │
│   ▼                     ▼                  ▼              ▼            ▼            │
│ ┌───────────┐    ┌──────────────┐    ┌──────────┐  ┌──────────┐ ┌──────────┐       │
│ │ Gitleaks  │    │  Dependency  │    │  CodeQL  │  │ Semgrep  │ │ Gitleaks │       │
│ │ (PR mode) │    │    Review    │    │  (SAST)  │  │   CE     │ │ (full)   │       │
│ └───────────┘    └──────────────┘    └──────────┘  └──────────┘ └──────────┘       │
│       │                │                   │            │            │              │
│       │                │                   ▼            ▼            ▼              │
│       │                │            ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│       │                │            │Scorecard │  │  Trivy   │  │TruffleHog│       │
│       │                │            │(OpenSSF) │  │   FS     │  │          │       │
│       │                │            └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │                │                 │             │             │              │
│       └────────────────┴─────────────────┴─────────────┴─────────────┘              │
│                                          │                                          │
│                                          ▼                                          │
│                              ┌─────────────────────────────┐                        │
│                              │  SARIF → GitHub Security    │                        │
│                              │      Alerts Dashboard       │                        │
│                              └─────────────────────────────┘                        │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Permission Model

The platform follows **least-privilege** with job-level escalation only when required.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        PERMISSION ESCALATION MODEL                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   WORKFLOW DEFAULT (read-only)          JOB ESCALATION (when required)              │
│   ────────────────────────────          ──────────────────────────────              │
│                                                                                      │
│   permissions:                          permissions:                                 │
│     contents: read ─────────────────►     contents: read                            │
│                                           pull-requests: write  ◄── PR comments     │
│                                           security-events: write ◄── SARIF upload  │
│                                           contents: write ◄── release.yml only     │
│                                                                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   FORK PR SECURITY MODEL                                                             │
│   ──────────────────────                                                             │
│                                                                                      │
│   ┌──────────────┐     ┌──────────────┐                                             │
│   │  First-party │     │   Fork PR    │                                             │
│   │     PR       │     │              │                                             │
│   └──────┬───────┘     └──────┬───────┘                                             │
│          │                    │                                                      │
│          ▼                    ▼                                                      │
│   ┌──────────────┐     ┌──────────────┐                                             │
│   │ PR comments  │     │ PR comments  │                                             │
│   │   ENABLED    │     │   DISABLED   │  ◄── Security: prevents token leakage      │
│   └──────────────┘     └──────────────┘                                             │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  PRINCIPLE: Fork PRs never receive write tokens. This prevents malicious   │   │
│   │  code from using PR context to exfiltrate secrets or modify the repo.      │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Quickstart

### Decision Tree: Which Workflow Do I Use?

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          WORKFLOW SELECTION GUIDE                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   What do you need?                                                                  │
│         │                                                                            │
│         ├── PR validation on pull_request events?                                   │
│         │         │                                                                  │
│         │         └──► pr-checks.yml (auto-triggers, fixed defaults)                │
│         │                                                                            │
│         ├── PR validation called from another workflow?                             │
│         │         │                                                                  │
│         │         └──► pr-gates.yml (workflow_call, full configurability)           │
│         │                                                                            │
│         ├── Just security checks (secrets, deps)?                                   │
│         │         │                                                                  │
│         │         └──► pr-security.yml (fast, PR-scoped)                            │
│         │                                                                            │
│         ├── Deep security scans on schedule?                                        │
│         │         │                                                                  │
│         │         └──► security-scheduled.yml (CodeQL, Semgrep, full repo)          │
│         │                                                                            │
│         ├── License compliance check?                                               │
│         │         │                                                                  │
│         │         └──► license-compliance.yml                                       │
│         │                                                                            │
│         ├── Contract validation for consumers?                                      │
│         │         │                                                                  │
│         │         └──► consumer-contract.yml                                        │
│         │                                                                            │
│         ├── Deterministic build artifacts?                                          │
│         │         │                                                                  │
│         │         └──► build-artifacts.yml                                          │
│         │                                                                            │
│         └── Create a release (tag + GitHub Release)?                                │
│                   │                                                                  │
│                   └──► release.yml (manual trigger)                                 │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

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

### Common Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `runner` | string | `ubuntu-22.04` | GitHub Actions runner label |
| `node_version` | string | `22` | Node.js major version |
| `fetch_depth` | number | `1` | Git fetch depth (0 = full history) |
| `cache` | string | `1` | Enable dependency caching (1=on, 0=off) |
| `platform_ref` | string | SHA | Platform repo ref for shared configs |
| `retention_days` | number | `7` | Artifact retention in days |
| `ps_full_scan` | string | `1` | Enable strict/full scan mode |

### PR-Specific Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `pr_number` | string | `""` | Pull request number |
| `pr_is_fork` | string | `"false"` | Whether PR is from a fork |
| `allow_pr_comments` | string | `"0"` | Allow PR failure comments |
| `pr_base_ref` | string | `""` | PR base SHA for diff checks |
| `pr_head_ref` | string | `""` | PR head SHA for diff checks |

### Artifact Outputs

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            ARTIFACT STRUCTURE                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   reports/                          logs/                                            │
│   ├── validate-ci/                  ├── lint/                                       │
│   │   └── validate-ci.json          │   ├── summary.txt                             │
│   ├── security/                     │   └── _steps                                  │
│   │   └── gitleaks-pr.sarif         ├── security/                                   │
│   ├── evasion/                      └── jscpd/                                      │
│   │   └── evasion-scan.json             ├── jscpd-report.json                       │
│   └── summary/                          └── html/                                   │
│       └── test-summary.json                                                          │
│                                                                                      │
│   coverage/                         sarif/                                           │
│   ├── lcov.info                     ├── codeql.sarif                                │
│   └── coverage-summary.json         ├── semgrep.sarif                               │
│                                     └── trivy.sarif                                 │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| Artifact Path | Content | Workflows |
|---------------|---------|-----------|
| `reports/**` | Structured JSON/HTML reports | All |
| `logs/**` | Execution logs and traces | All |
| `coverage/**` | Test coverage reports | PR Gates |
| `sarif/**` | Security scan results (SARIF format) | Security workflows |

---

## Dependency Policy

All external actions must be SHA-pinned and allowlisted.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL ACTION VERIFICATION                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   ❌ INVALID (tag/branch reference)                                                  │
│   uses: actions/checkout@v4                                                          │
│                                                                                      │
│   ✅ VALID (40-char SHA)                                                             │
│   uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683                   │
│                                                                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   VERIFICATION PROCESS                                                               │
│   ────────────────────                                                               │
│                                                                                      │
│   ┌─────────────┐    ┌─────────────────────┐    ┌─────────────────┐                 │
│   │  Workflow   │───►│    validate-ci      │───►│  Policy Check   │                 │
│   │  uses: ...  │    │    (policy gate)    │    │                 │                 │
│   └─────────────┘    └──────────┬──────────┘    └────────┬────────┘                 │
│                                 │                        │                          │
│                      ┌──────────┼──────────┐             │                          │
│                      ▼          ▼          ▼             ▼                          │
│               ┌───────────┐ ┌────────┐ ┌────────┐ ┌────────────┐                    │
│               │ Allowlist │ │SHA is  │ │No curl │ │No cred     │                    │
│               │ check     │ │40-char │ │pipe sh │ │persist     │                    │
│               └───────────┘ └────────┘ └────────┘ └────────────┘                    │
│                                                                                      │
│   Allowlist: configs/ci/exceptions/actions-allowlist.yml                            │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Testing

Workflows are validated by:

| Tool | Purpose |
|------|---------|
| `actionlint` | Syntax and semantic validation |
| `validate-ci` | Policy enforcement (SHA pinning, permissions, patterns) |
| `tools/tests/actions.test.js` | Action catalog consistency |

Run locally:

```bash
npm run lint
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [Testing Strategy](../../docs/testing-strategy.md) | Test philosophy and coverage goals |
| [Security CI Policy](../../docs/security-ci-policy.md) | Security scanning requirements |
| [CI Policy Governance](../../docs/ci-policy-governance.md) | Policy rules and enforcement |
| [Risk Decisions](../../docs/risk-decisions.md) | Documented security trade-offs |
| [Integration Guide](../../docs/integration-guide.md) | Consumer onboarding guide |
| [Versioning](../../docs/versioning.md) | Release and tagging strategy |

---

> 📝 **Maintainer Note**: Keep this README in sync with workflow changes. Update diagrams when adding new workflows or modifying the execution flow.
