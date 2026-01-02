<!--
# ==============================================================================
# Political Sphere — PS Checkout (Repo) (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for PS Checkout (Repo).
#
# Dependencies:
#   - actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
#
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-init
# ==============================================================================
-->

# PS Checkout (Repo)

Security Tier 0: Hardened repository acquisition. This action ensures code is
pulled into the runner without leaving persistent credentials in the workspace.

## Security Features

- SHA-pinned integrity: Uses `actions/checkout` pinned to a specific commit to
  prevent supply-chain attacks.
- Credential hygiene: Defaults `persist_credentials` to `false`, preventing the
  `GITHUB_TOKEN` from being stored in `.git/config`.
- Note: `actions/checkout` defaults `persist-credentials` to `true`. Enforcing
  `false` reduces the risk of compromised tooling exfiltrating `GITHUB_TOKEN`.
- History validation: Enforces `fetch_depth: 0` when `require_full_history` is
  enabled, so security scanners cannot be bypassed by shallow clones.

## Usage

```yaml
- name: Checkout repo
  uses: ./.github/actions/ps-bootstrap/ps-checkout-repo
  with:
    fetch_depth: "1"
    require_full_history: "false"
```

## Inputs

- `fetch_depth`: Number of commits to fetch. `0` fetches all history. Default: `1`.
- `ref`: Branch, tag, or SHA to checkout. Default: empty.
- `persist_credentials`: Whether to store the token in the runner git config
  (`true`|`false`). Default: `false`.
- `submodules`: Submodule checkout strategy (`false`|`true`|`recursive`).
  Default: `false`.
- `require_full_history`: Fail if `fetch_depth` is not `0` (`true`|`false`).
  Default: `false`.

## Operational Logic

- Pre-flight validation rejects invalid fetch depths or mismatched history requirements.
- Runs after `ps-harden-runner` so git network traffic is subject to the egress policy.
- Validated parameters are emitted to `GITHUB_ENV` as:
  `PS_FETCH_DEPTH_VALIDATED`, `PS_PERSIST_CREDENTIALS_VALIDATED`,
  `PS_SUBMODULES_VALIDATED`, `PS_REQUIRE_FULL_HISTORY_VALIDATED`.

Note: `actions/checkout` defaults to `persist-credentials: true`; this action
enforces `false` to prevent token persistence in `.git/config`.
