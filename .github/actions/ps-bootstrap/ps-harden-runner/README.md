<!--
# ==============================================================================
# Political Sphere — PS Harden Runner (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for PS Harden Runner.
#
# Dependencies:
#   - step-security/harden-runner@20cf305ff2072d973412fa9b1e3a4f227bda3c76
#
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-init
# ==============================================================================
-->

# PS Harden Runner

This action is the network perimeter for every job. It establishes the secure
root of trust before any repository code is checked out.

## Security Architecture

ps-harden-runner establishes a secure root of trust by:

- SHA-256 pinning: Immutable hashes prevent supply-chain injection.
- Network firewalling: Outbound traffic is monitored or blocked before any
  checkout occurs.
- Zero-workspace dependency: Runs independent of `${GITHUB_WORKSPACE}` to avoid
  persistent-state attacks on self-hosted runners.

## Usage

```yaml
- name: Harden runner
  uses: ./.github/actions/ps-bootstrap/ps-harden-runner
  with:
    egress_policy: audit
```

## Inputs

- `egress_policy`: Enforcement level for outbound traffic (`audit`|`block`).
  Default: `audit`.
  - `audit`: Permissive. Logs outbound connections to build a domain profile.
  - `block`: Restricted. Drops outbound traffic not explicitly allowed. Use for
    protected branches and production jobs.
- `home_dir`: Execution context for the hardening agent. Default:
  `${{ runner.temp }}`. This keeps the agent state isolated from build artifacts.

## Egress Policy Guidance

- `audit`: Monitor outbound traffic to discover required domains.
- `block`: Enforce allowlisted egress only (recommended for protected branches).

[!TIP] Recommended pattern: use `audit` on feature branches and `block` on
protected branches to prevent unauthorized egress during releases.

## Operational Example

```yaml
# Step 1: Run in audit mode to discover required domains
- name: Harden Runner (Discovery)
  uses: ./.github/actions/ps-bootstrap/ps-harden-runner
  with:
    egress_policy: audit

# Step 2: Enforce block mode on main
- name: Harden Runner (Enforcement)
  uses: ./.github/actions/ps-bootstrap/ps-harden-runner
  if: github.ref == 'refs/heads/main'
  with:
    egress_policy: block
```

## Auditability

Use the hardening logs to track outbound attempts and confirm allowed domains
before promoting to `block`. Invalid inputs fail fast and halt the job to avoid
silent security downgrades.
