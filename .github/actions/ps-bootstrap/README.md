<!--
# ==============================================================================
# Political Sphere — PS Bootstrap (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational overview for Political Sphere bootstrap actions.
#
# Dependencies:
#   - ./.github/actions/ps-bootstrap/ps-harden-runner
#   - ./.github/actions/ps-bootstrap/ps-checkout-repo
#   - ./.github/actions/ps-bootstrap/ps-checkout-platform
#   - ./.github/actions/ps-bootstrap/ps-init
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
- `ci-validate`: Run Validate-CI gate against a checked-out platform repo.

## Typical usage

```yaml
- name: PS init
  uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    egress_policy: audit
    fetch_depth: "1"
    platform_repo: PoliticalSphere/ci
    install_tools: "1"
    tools_bundle: lint
```

For full contracts, see each action's README in its directory.
