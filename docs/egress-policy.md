<!--
# ==============================================================================
# Political Sphere — Egress Policy Guide
# ------------------------------------------------------------------------------
# Purpose:
#   Document the network egress policy model, allowlist management, and
#   enforcement mechanisms for the CI/CD platform.
#
# Dependencies:
#   - configs/ci/policies/egress-allowlist.yml
#   - configs/ci/policies/harden-runner.yml
#   - tools/scripts/egress.sh
#
# Dependents:
#   - Workflow authors adding new network dependencies
#   - Security reviewers evaluating egress changes
# ==============================================================================
-->

# Egress Policy Guide

This document describes the Political Sphere CI/CD platform's approach to
controlling outbound network access from CI jobs.

---

## Overview

The platform enforces a **default-deny egress policy**. CI jobs may only
contact explicitly allowlisted external hosts. This prevents:

- Data exfiltration through compromised dependencies
- Supply chain attacks that phone home
- Unauthorized credential leakage
- Dependency confusion attacks

---

## Policy Components

### 1. Runner Hardening

The `ps-harden-runner` action (via StepSecurity's harden-runner) enforces
network policies at the runner level:

```yaml
- uses: ./.github/actions/ps-bootstrap/ps-harden-runner
  with:
    egress_policy: audit   # or 'block' for strict enforcement
```

**Egress Modes:**

| Mode | Behavior |
|------|----------|
| `audit` | Log all egress connections, don't block |
| `block` | Block connections to non-allowlisted hosts |

### 2. Egress Allowlist

The canonical allowlist lives at:

```
configs/ci/policies/egress-allowlist.yml
```

Current allowed destinations:

| Host | Purpose |
|------|---------|
| `api.github.com` | GitHub API calls |
| `github.com` | Git operations |
| `objects.githubusercontent.com` | GitHub releases |
| `raw.githubusercontent.com` | Raw file downloads |
| `pypi.org` | Python packages (semgrep, yamllint) |
| `files.pythonhosted.org` | Python package artifacts |
| `sonarcloud.io` | SonarCloud analysis |

### 3. Script-Level Enforcement

The `tools/scripts/egress.sh` library provides Bash functions for runtime
egress validation:

```bash
source tools/scripts/egress.sh

# Load the allowlist
load_egress_allowlist

# Validate a host
assert_egress_allowed_host "api.github.com"

# Validate a URL
assert_egress_allowed_url "https://api.github.com/repos/..."

# Validate the git remote
assert_egress_allowed_git_remote origin
```

---

## Adding a New Allowed Host

### 1. Document the Requirement

Before adding a host, document:

- What tool or feature requires this egress
- What data is transmitted
- Is there an alternative that doesn't require egress?

### 2. Create a Risk Decision

Add an entry to `docs/risk-decisions.md`:

```markdown
## Egress: example.com

**Date**: 2026-01-02
**Requestor**: @username
**Status**: Approved

### Context
The XYZ tool requires contacting example.com to download...

### Decision
Allow egress to example.com for XYZ functionality.

### Mitigations
- Pinned to specific version
- Only contacted during specific job phase
```

### 3. Update the Allowlist

Edit `configs/ci/policies/egress-allowlist.yml`:

```yaml
allowlist:
  # Existing entries...

  # XYZ tool (see docs/risk-decisions.md)
  - example.com
```

### 4. Test the Change

```bash
# Verify allowlist loads correctly
npm run validate-ci

# Test in audit mode first
# (in a workflow with egress_policy: audit)
```

---

## Enforcement Levels

### Level 1: Audit Mode (Default for Development)

- All egress is logged
- No connections are blocked
- Review logs for unexpected destinations

```yaml
- uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    egress_policy: audit
```

### Level 2: Block Mode (Production)

- Egress to non-allowlisted hosts is blocked
- Jobs fail if they attempt unauthorized egress
- Maximum security posture

```yaml
- uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    egress_policy: block
```

### Level 3: Script Validation

- In-script checks before making network calls
- Fails fast with clear error messages
- Defense in depth

```bash
assert_egress_allowed_url "${DOWNLOAD_URL}" || exit 1
curl -sSL "${DOWNLOAD_URL}" -o output.tar.gz
```

---

## Debugging Egress Issues

### "Egress host not allowlisted" Error

```
ERROR: egress host not allowlisted: unknown-host.com
```

**Resolution:**

1. Identify which tool is making the request
2. Determine if the egress is legitimate
3. If legitimate, follow the "Adding a New Allowed Host" process
4. If not legitimate, investigate potential compromise

### Workflow Hangs or Times Out

In block mode, connections to non-allowlisted hosts will be blocked, which
may cause timeouts rather than immediate failures.

**Resolution:**

1. Run with `egress_policy: audit` temporarily
2. Review the harden-runner logs for blocked connections
3. Add legitimate hosts to the allowlist or fix the offending tool

### Checking Current Allowlist

```bash
# View the allowlist
cat configs/ci/policies/egress-allowlist.yml

# Validate the allowlist loads correctly
npm run validate-ci
```

---

## Security Considerations

### Why Default-Deny?

- **Prevent Exfiltration**: Compromised code can't send data to arbitrary hosts
- **Supply Chain Defense**: Malicious packages can't phone home
- **Auditability**: All external connections are documented and reviewed
- **Compliance**: Demonstrates intentional network access control

### Allowlist Hygiene

- Review the allowlist quarterly
- Remove hosts no longer needed
- Document the purpose of each entry
- Prefer specific hosts over wildcards

### Monitoring

The harden-runner action logs all egress attempts. Review these logs
periodically for:

- Unexpected destinations
- High-frequency connections
- Connections during unexpected job phases

---

## Related Documentation

- [CI Policy](ci-policy.md) — Overall CI policy requirements
- [Security CI Policy](security-ci-policy.md) — Security-specific policies
- [Risk Decisions](risk-decisions.md) — Documented policy exceptions
- [Composite Actions Guide](composite-actions-guide.md) — Action usage

---

## Configuration Reference

### egress-allowlist.yml Schema

```yaml
# Required: list of allowed hostnames
allowlist:
  - hostname1.example.com
  - hostname2.example.com
  # Comments documenting purpose are encouraged
```

### harden-runner.yml Schema

```yaml
rule:
  require_harden_runner: true          # Require hardening
  require_egress_policy_when_supported: true  # Require egress config
  allowed_first_steps:                 # Valid first job steps
    - ./.github/actions/ps-bootstrap/ps-init
    - ./.github/actions/ps-bootstrap/ps-harden-runner
    - step-security/harden-runner@
```

