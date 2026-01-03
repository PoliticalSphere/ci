<!--
# ==============================================================================
# Political Sphere — Composite Actions Guide
# ------------------------------------------------------------------------------
# Purpose:
#   Document the action catalog, categories, selection guidance, and usage
#   patterns for the Political Sphere composite action system.
#
# Dependencies:
#   - .github/actions/README.md (action catalog)
#   - docs/integration-guide.md (consumer perspective)
#
# Dependents:
#   - Workflow authors and platform developers
# ==============================================================================
-->

# Composite Actions Guide

This guide explains how to select and use the Political Sphere composite action
system effectively. All composite actions live in `.github/actions/`.

---

## Action Categories

The action system is organized into three lifecycle phases:

| Category | Directory | Purpose |
|----------|-----------|---------|
| **Bootstrap** | `ps-bootstrap/` | Job initialization, security hardening, checkout |
| **Task** | `ps-task/` | Execution of lint, test, build, security scans |
| **Teardown** | `ps-teardown/` | Cleanup, artifact upload, summary generation |

Additionally:

| Category | Directory | Purpose |
|----------|-----------|---------|
| **Validate** | `ps-ci-validate/` | CI policy validation action |

---

## Action Selection Flowchart

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JOB STARTS                                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. BOOTSTRAP PHASE                                                 │
│  ─────────────────                                                  │
│  • Harden runner (egress policy, allowed endpoints)                 │
│  • Checkout repository                                              │
│  • Setup Node.js and dependencies                                   │
│  • Install tool bundles (lint, security)                            │
│                                                                     │
│  Use: ps-bootstrap/ps-init (or individual sub-actions)              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. TASK PHASE                                                      │
│  ─────────────                                                      │
│  • Run linting, type checking, tests                                │
│  • Execute security scans                                           │
│  • Build artifacts                                                  │
│  • Check licenses and contracts                                     │
│                                                                     │
│  Use: ps-task/* actions (lint, test, build, security, etc.)         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. TEARDOWN PHASE                                                  │
│  ────────────────                                                   │
│  • Upload artifacts                                                 │
│  • Write job summary                                                │
│  • Post PR comments                                                 │
│  • Exit with appropriate code                                       │
│                                                                     │
│  Use: ps-teardown/* actions (ps-upload-artifacts, ps-write-summary) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Bootstrap Actions (`ps-bootstrap/`)

### `ps-init` — Canonical Entrypoint

The recommended way to start any job. Combines hardening, checkout, and setup:

```yaml
- name: Job setup
  uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    egress_policy: audit          # or 'block' for strict mode
    fetch_depth: "1"              # shallow clone
    install_tools: "1"            # install CLI tools
    tools_bundle: lint            # which tools to install
```

### Individual Bootstrap Actions

| Action | Purpose | When to Use |
|--------|---------|-------------|
| `ps-harden-runner` | Apply security hardening | Already using ps-init? Skip. |
| `ps-checkout-repo` | Checkout current repo | Need custom checkout options |
| `ps-checkout-platform` | Checkout platform repo | Consumer repos needing platform |
| `ps-node` | Setup Node.js | Custom Node.js configuration |
| `ps-tools` | Install CLI tools | Need tools without full init |

### Example: Minimal Bootstrap (Security Only)

```yaml
- name: Security-only bootstrap
  uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    skip_checkout: "1"
    install_dependencies: "0"
    install_tools: "0"
    egress_policy: block
```

---

## Task Actions (`ps-task/`)

All task actions delegate to `ps-task/ps-run`, which enforces:

- Input validation
- Structured logging
- Report generation
- Consistent exit codes

### Code Quality Tasks

| Action | Purpose | Artifacts |
|--------|---------|-----------|
| `lint` | Run linting suite | `logs/ps-task/lint.log` |
| `typecheck` | TypeScript type checking | `logs/ps-task/typecheck.log` |
| `test` | Unit test execution | `logs/ps-task/test.log` |
| `build` | Deterministic build | `logs/ps-task/build.log` |
| `jscpd` | Copy-paste detection | `logs/ps-task/jscpd.log` |

```yaml
- name: Run lint
  uses: ./.github/actions/ps-task/lint
```

### Security Tasks

| Action | Purpose | Output |
|--------|---------|--------|
| `semgrep-cli` | Static analysis | SARIF to Security tab |
| `secret-scan-pr` | Secret detection in PRs | SARIF report |
| `trivy` | Container/dependency scanning | SARIF report |
| `trufflehog` | Deep secret scanning | Findings report |
| `codeql` | Code analysis (external) | GitHub Security tab |
| `scorecard` | Supply chain security | Scorecard results |

```yaml
- name: Run Semgrep
  uses: ./.github/actions/ps-task/semgrep-cli
  with:
    upload_sarif: "true"
```

### Compliance Tasks

| Action | Purpose | Policy File |
|--------|---------|-------------|
| `license-check` | Dependency license compliance | `configs/security/license-policy.yml` |
| `consumer-contract` | Consumer repo validation | `configs/consumer/contract.json` |
| `dependency-review` | PR dependency changes | GitHub built-in |

```yaml
- name: License compliance
  uses: ./.github/actions/ps-task/license-check
```

---

## Teardown Actions (`ps-teardown/`)

### `ps-upload-artifacts`

Upload job artifacts with standardized naming:

```yaml
- name: Upload artifacts
  uses: ./.github/actions/ps-teardown/ps-upload-artifacts
  with:
    artifact_name: pr-gates-${{ github.run_id }}
    include_logs: "true"
    include_reports: "true"
```

### `ps-write-summary`

Generate a GitHub Actions job summary:

```yaml
- name: Write summary
  uses: ./.github/actions/ps-teardown/ps-write-summary
  with:
    title: "PR Gates Summary"
    status: ${{ job.status }}
```

### `ps-pr-comment`

Post results as a PR comment:

```yaml
- name: Comment on PR
  uses: ./.github/actions/ps-teardown/ps-pr-comment
  with:
    pr_number: ${{ github.event.pull_request.number }}
    body_file: reports/summary.md
```

### `ps-exit`

Ensure proper job exit with cleanup:

```yaml
- name: Job exit
  uses: ./.github/actions/ps-teardown/ps-exit
  if: always()
```

---

## Validation Action (`ps-ci-validate/`)

Standalone action for CI policy validation:

```yaml
- name: Validate CI
  uses: ./.github/actions/ps-ci-validate
```

---

## Complete Job Example

```yaml
jobs:
  pr-gates:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      # Bootstrap
      - name: Job setup
        uses: ./.github/actions/ps-bootstrap/ps-init
        with:
          egress_policy: audit
          install_tools: "1"
          tools_bundle: lint

      # Tasks
      - name: Lint
        uses: ./.github/actions/ps-task/lint

      - name: Typecheck
        uses: ./.github/actions/ps-task/typecheck

      - name: Test
        uses: ./.github/actions/ps-task/test

      # Teardown
      - name: Upload artifacts
        uses: ./.github/actions/ps-teardown/ps-upload-artifacts
        if: always()
        with:
          artifact_name: pr-gates-${{ github.run_id }}

      - name: Write summary
        uses: ./.github/actions/ps-teardown/ps-write-summary
        if: always()
```

---

## Adding a New Task Action

1. Create directory: `.github/actions/ps-task/<task-name>/`

2. Create `action.yml`:

   ```yaml
   name: PS Task - My Task
   description: Run my custom task
   inputs:
     # Define inputs
   runs:
     using: composite
     steps:
       - uses: ./.github/actions/ps-task/ps-run
         with:
           task_id: my-task
           script: tools/scripts/my-task.sh
   ```

3. Add script: `tools/scripts/<category>/my-task.sh`

4. Add test coverage: `tools/tests/my-task.test.js`

5. Update documentation

---

## Design Principles

1. **Single Responsibility**: Each action does one thing well
2. **Delegation**: Task actions delegate to `ps-run` for consistency
3. **Observability**: All actions emit structured logs and reports
4. **Security First**: Hardening happens before any code execution
5. **Composability**: Actions can be combined or used individually

---

## Input Standards

### Boolean Inputs

Boolean inputs use **string values** and are normalized by the platform:

| Accepted Values | Normalized To |
|-----------------|---------------|
| `"1"`, `"true"`, `"yes"`, `"on"` | `"1"` |
| `"0"`, `"false"`, `"no"`, `"off"`, `""` | `"0"` |

**Convention**: Use `"0"` and `"1"` for new inputs. The normalization layer
(`tools/scripts/actions/cross-cutting/normalize.sh`) handles both styles.

```yaml
# Preferred style
inputs:
  enable_cache:
    description: "Enable dependency caching"
    default: "1"
```

### Input Validation

All actions should validate inputs using the shared helpers:

```bash
# Source validation helpers
source tools/scripts/lib/validation.sh

# Use standard validators
cache=$(require_bool "inputs.cache" "$cache")
require_nonempty "inputs.script" "$script"
require_number "inputs.timeout" "$timeout"
require_enum "inputs.mode" "$mode" "fast" "full" "skip"
```

### Error Handling

Use the shared `fail()` function for consistent error handling:

```bash
# Source the shared fail helper
source tools/scripts/lib/bash/fail.sh

# Use fail() for fatal errors
[[ -n "${SCRIPT:-}" ]] || fail "script is required"
```

---

## Related Documentation

- [Action Catalog](.github/actions/README.md) — Full action reference
- [Local Development](local-development.md) — Running actions locally
- [CI Policy](ci-policy.md) — Policy requirements
- [Integration Guide](integration-guide.md) — Consumer repository setup
