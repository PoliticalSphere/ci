<!--
# ==============================================================================
# Political Sphere — PS Tools (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for PS Tools.
#
# Dependencies:
#   - tools/scripts/actions/ps-tools/ps-tools-resolve-root.sh
#   - tools/scripts/actions/ps-tools/ps-tools-validate-inputs.sh
#   - tools/scripts/actions/ps-tools/ps-tools-assemble.sh
#   - tools/scripts/actions/ps-tools/ps-tools-install.sh
#   - tools/scripts/ci/install-tools.sh
#   - configs/security/*.env (version pins for tooling)
#   - actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 (optional)
#   - ./.github/actions/ps-task/ps-run (optional)
#
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-init (optional tools install)
# ==============================================================================
-->

# PS Tools

Security Tier 0: Deterministic installation of approved tooling. This action
secures the execution layer by preventing ad-hoc downloads and ensuring pinned,
policy-aligned binaries are installed consistently across runners.

## Security Features

- Content-addressable caching: Cache keys include installer hash, tool list
  hash, and version pin files to prevent stale or mismatched binaries.
- Symlink and path validation: Post-install checks prevent symlink escapes
  outside the tools directory.
- Input gating: Strict normalization protects against malformed tool lists.
- Scoped egress: Runs under `ps-harden-runner`; unauthorized downloads are blocked.

## Requirements

- `python3` is required for hash calculation and symlink resolution. GitHub-hosted
  runners include this by default; self-hosted runners must pre-install it.

## Usage

```yaml
- name: Install tools
  uses: ./.github/actions/ps-bootstrap/ps-tools
  with:
    bundle: lint
    run_security_scans: "0"
```

## Inputs

- `install_dir`: Repo-relative directory for tools. Default: `.tooling/bin`.
- `bundle`: Predefined tools bundle (`lint`|`security`|`none`). Default: `none`.
- `extra_tools`: Optional newline-separated list of extra tool ids. Default: empty.
- `tools`: Optional explicit newline-separated tool list. Takes precedence over
  `bundle` and `extra_tools`. Default: empty.
- `run_security_scans`: Run fast security scans after install (`0`|`1`|`true`|`false`).
  Default: `0`.
- `cache_tools`: Enable caching for installed tools (`0`|`1`|`true`|`false`).
  Default: `false`.

## Outputs

- `resolved_tools`: Final newline-separated tool ids selected for install.
- `install_dir_abs`: Absolute path to the install directory.

## Notes

- Tool selection precedence is: `tools` > `bundle` + `extra_tools` (bundle/extras ignored when `tools` is set).
- `install_dir` must be repo-relative and must not contain `..` or be absolute.
- When `cache_tools` is enabled, the cache key is derived from the resolved tool list, runner OS, installer script hash, and any `configs/security/*.env` files that define tool versions.
- If your repo does not provide `configs/security/*.env`, caching remains functional but may not invalidate when tool versions change.
- Tools are added to `GITHUB_PATH` for subsequent workflow steps, but not for earlier steps inside this composite action. Use the absolute path from `PS_TOOLS_BIN` if a step inside this action needs to invoke a tool.
- The action uses `python3` for hashing and symlink resolution. Ensure Python 3
  is available on self-hosted runners.
- Enabling `run_security_scans` runs a fast secrets scan immediately after
  installation as a first-line self-audit.
