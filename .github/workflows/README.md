# Workflows

Reusable GitHub Actions workflows for the Political Sphere CI/CD platform.
These workflows are policy-enforcing building blocks consumed by PS repositories.

---

## Purpose

Reusable workflows exist to:

- Provide consistent CI gates across all PS repositories
- Centralise security, quality, and governance controls
- Reduce duplication and configuration drift
- Enable deterministic, auditable CI execution
- Support AI-driven usage through explicit structure and contracts

---

## Workflow Catalog

Primary workflows:

- `pr-gates.yml`: fast PR validation (lint/type/test/duplication/build + fast secrets)
- `validate-ci.yml`: CI policy gate (SHA pinning, permissions, unsafe patterns)
- `security-scheduled.yml`: scheduled security scans (CodeQL, Semgrep, Scorecard, Trivy, secrets)
- `license-compliance.yml`: dependency license policy checks
- `consumer-contract.yml`: consumer repository contract validation
- `build-artifacts.yml`: deterministic builds + artifact upload
- `release.yml`: optional release/tagging flow

Reusable definitions live in `_reusable-*.yml`. The non-prefixed workflows are
callers that bind events (pull_request/schedule/dispatch) or external `uses:`
calls to the reusable job definitions.

Each workflow documents:

- required inputs
- expected outputs and artifacts
- required permissions
- failure semantics

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

## Quickstart

Example (consumer repo):

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

---

## Inputs and Outputs

Every workflow exposes explicit inputs and uploads structured artifacts.
The default artifact paths include `reports/**` and `logs/**`.
See each workflow header for full inputs, permissions, and constraints.

---

## Dependency Policy

All external actions must be:

- SHA‑pinned to full commit SHAs
- present in `configs/ci/exceptions/actions-allowlist.yml`
- validated by `validate-ci`

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
