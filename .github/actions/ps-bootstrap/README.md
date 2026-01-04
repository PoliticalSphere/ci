<!--
# ==============================================================================
# Political Sphere — PS Bootstrap (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational overview for Political Sphere bootstrap actions.
#
# Dependencies:
#   - ./.github/actions/ps-bootstrap/ps-harden-runner
#   - ./.github/actions/ps-bootstrap/ps-checkout-source
#   - ./.github/actions/ps-bootstrap/ps-checkout-platform
#   - ./.github/actions/ps-bootstrap/ps-initialize-environment
#   - ./.github/actions/ps-bootstrap/ps-tools
#
# Dependents:
#   - Workflow jobs using the Political Sphere bootstrap sequence
# ==============================================================================
-->

# PS Bootstrap Actions

Composite actions that bootstrap Political Sphere CI jobs. Use `ps-init` as the
canonical entrypoint and the other actions as narrower, reusable building
blocks.

## Actions

- `ps-init`: Harden runner, checkout repo, isolate HOME, optional platform
  checkout, optional tools install.
- `ps-harden-runner`: Harden the runner with a pinned action.
- `ps-checkout-repo`: Checkout the current repository with validated inputs.
- `ps-checkout-platform`: Checkout a platform repository into a controlled path.
- `ps-node`: Setup Node.js and optionally install dependencies.
- `ps-tools`: Install pinned CLI tooling bundles and optional fast scans.

## Typical usage

```yaml
- name: PS init
  uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  with:
    egress_policy: audit
    fetch_depth: "1"
    platform_repo: PoliticalSphere/ci
    install_tools: "1"
    tools_bundle: lint
```

For full contracts, see each action's README in its directory.
---

## Performance Benchmarks

### Validation Timing

All bootstrap actions emit timing metrics to `$GITHUB_ENV` for monitoring:

| Action | Metric Variable | Typical Duration | Notes |
|--------|----------------|------------------|-------|
| `ps-initialize-environment` | `PS_INIT_VALIDATION_DURATION_SEC` | < 2s | Full initialization with all validations |
| `ps-node` | `PS_NODE_VALIDATION_DURATION_SEC` | < 1s | Node.js setup and package validation |
| `ps-checkout-platform` | N/A | < 3s | Depends on repository size and depth |
| `ps-tools` | N/A | 5-15s | Depends on bundle size and cache status |

### Optimization Tips

**Fastest configuration** (< 5s total):
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  with:
    fetch_depth: "1"                 # Shallow clone (fastest)
    skip_platform_checkout: "1"      # Skip platform
    install_tools: "0"               # Skip tools
```

**Balanced configuration** (< 15s total):
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  with:
    fetch_depth: "1"                 # Shallow clone
    platform_fetch_depth: "1"        # Shallow platform
    install_tools: "1"
    tools_bundle: "lint"             # Smaller bundle
```

**Full-featured configuration** (< 30s total):
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  with:
    fetch_depth: "0"                 # Full history (for versioning)
    platform_fetch_depth: "1"
    install_tools: "1"
    tools_bundle: "security"         # Larger bundle
```

### Monitoring Performance

Access timing metrics in subsequent steps:

```yaml
- name: Report bootstrap performance
  run: |
    echo "## Bootstrap Performance" >> $GITHUB_STEP_SUMMARY
    echo "Validation: ${PS_INIT_VALIDATION_DURATION_SEC}s" >> $GITHUB_STEP_SUMMARY
    echo "Node setup: ${PS_NODE_VALIDATION_DURATION_SEC}s" >> $GITHUB_STEP_SUMMARY
```

**Factors affecting performance**:
- **Network latency**: Checkout and tool downloads
- **Repository size**: Larger repos take longer to clone
- **Fetch depth**: `depth=0` (full history) is slower than `depth=1`
- **Cache hits**: Cached tools install ~10x faster
- **Runner hardware**: GitHub-hosted vs self-hosted

---

## Troubleshooting

Common issues and solutions are documented in the [PS-Bootstrap Troubleshooting Guide](../../../docs/ps-bootstrap-troubleshooting.md).

Quick links:
- [Input validation failures](../../../docs/ps-bootstrap-troubleshooting.md#1-input-validation-failures)
- [Path validation failures](../../../docs/ps-bootstrap-troubleshooting.md#2-path-validation-failures)
- [Package manager issues](../../../docs/ps-bootstrap-troubleshooting.md#3-package-manager-issues)
- [Performance optimization](../../../docs/ps-bootstrap-troubleshooting.md#performance-optimization)

---