<!--
# ==============================================================================
# Political Sphere — PS Init (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for PS Init.
#
# Dependencies:
#   - ./.github/actions/ps-bootstrap/ps-harden-runner
#   - ./.github/actions/ps-bootstrap/ps-checkout-repo
#   - ./.github/actions/ps-bootstrap/ps-checkout-platform (optional)
#   - ./.github/actions/ps-bootstrap/ps-tools (optional)
#
# Dependents:
#   - Workflow jobs that use ps-init as the entrypoint
# ==============================================================================
-->

# PS Init

Security Tier 0: This action is the mandatory entrypoint for Political Sphere
jobs. Treat it as a security contract, not a convenience wrapper.

## Security Architecture

ps-init enforces a sandbox-first posture by moving the runner through three
phases:

1) Network lockdown via `ps-harden-runner` (egress policy applied before any
   code executes).
2) Filesystem isolation by relocating `HOME` into the workspace.
3) Credential scoping by emitting validated environment variables with heredoc
   delimiters to prevent newline injection.

## Contract Requirements

- ps-init MUST run before any other Political Sphere action.
- Disable or bypass isolation only with explicit intent and documentation.
- For self-hosted runners, cleanup is REQUIRED to avoid cross-job contamination.

## Compatibility Warning (Critical)

HOME isolation can break official actions that assume `/home/runner` or a
default HOME. Examples include `actions/setup-node`, `actions/setup-python`,
and `actions/cache`.

Option A (global escape): disable isolation for the job.

```yaml
- name: PS init (standard mode)
  uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    home_isolation: "false"
```

Option B (recommended): step-scoped escape hatch for specific actions.

```yaml
- name: Cache dependencies
  uses: actions/cache@v3
  env:
    HOME: ${{ env.HOME_ORIGINAL }} # Power-user override
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

## Usage

```yaml
- name: PS init
  uses: ./.github/actions/ps-bootstrap/ps-init
  with:
    egress_policy: audit
    fetch_depth: "1"
    platform_repo: PoliticalSphere/ci
    platform_ref: main
    platform_path: .ps-platform
    install_tools: "1"
    tools_bundle: lint
```

Switchboard order (execution flow):

1) `ps-harden-runner` (MUST be first)
2) `ps-checkout-repo`
3) HOME/XDG isolation (optional)
4) `ps-checkout-platform` (optional)
5) `ps-tools` (optional)

## Inputs

Security hardening:

- `egress_policy`: Egress policy for harden-runner (`audit`|`block`). Default: `audit`.

Repository checkout:

- `fetch_depth`: Git fetch depth (0 = full history). Default: `1`.
- `checkout_ref`: Optional git ref (branch/tag/SHA). Default: empty.
- `require_full_history`: Require `fetch_depth=0` (`0/1/true/false`). Default: `false`.

HOME isolation:

- `home_dir`: Repo-relative HOME directory to create/use. Default: `.home`.
- `home_isolation`: Enable HOME/XDG isolation for the job (`0/1/true/false`). Default: `true`.

Platform checkout (optional):

- `platform_repo`: Platform repository (`OWNER/REPO`). Default: `PoliticalSphere/ci`.
- `platform_ref`: Platform ref. Default: `main`.
- `platform_path`: Repo-relative platform checkout path. Default: `.ps-platform`.
- `skip_platform_checkout`: Skip platform checkout (`0/1/true/false`). Default: `false`.
- `platform_fetch_depth`: Platform fetch depth (0 = full history). Default: `1`.
- `platform_clean_path`: Delete platform_path before checkout (`0/1/true/false`). Default: `false`.
- `platform_require_pinned_ref`: Require `platform_ref` to be a full 40-char
  commit SHA (`0/1/true/false`). Default: `false`.
- `platform_allowed_repositories`: Optional newline-separated allowlist for
  `platform_repo`. Default: empty.

Tools (optional):

- `install_tools`: Install tool bundles (`0/1/true/false`). Default: `0`.
- `tools_bundle`: Tools bundle (`lint`|`security`|`none`). Default: `none`.

## Outputs

- `repo_root`: Resolved repository root (`GITHUB_WORKSPACE`).
- `home_dir`: Absolute path to the HOME directory used by the job.
- `home_original`: Original HOME before isolation (absolute path).
- `home_isolation_enabled`: `true` when HOME isolation was applied, else `false`.
- `init_metadata`: JSON metadata about the init environment.
- `platform_root`: Absolute path to the platform checkout, or empty when skipped.
- `platform_enabled`: `true` when platform checkout ran, else `false`.

## Behavior

- `ps-harden-runner` runs first with no steps before it.
- Boolean toggles accept `0/1/true/false` and are normalized.
- Repo-relative paths must not be absolute or contain `..`.
- When platform checkout runs, `PS_PLATFORM_ROOT` is exported to the job env.
- When `home_isolation` is enabled, `HOME` and `XDG_*` are exported for subsequent steps.

## Lifecycle Management (self-hosted only)

On non-ephemeral runners, cleanup is a security requirement. Without it,
isolated state can leak between jobs.

```yaml
- name: Post-Job Cleanup
  if: always()
  shell: bash
  run: |
    echo "HOME=${HOME_ORIGINAL}" >> "$GITHUB_ENV"
    rm -rf "${GITHUB_WORKSPACE}/.home"
    unset XDG_CONFIG_HOME
    unset XDG_CACHE_HOME
    unset XDG_STATE_HOME
```

## Auditability

Use the `init_metadata` output to capture environment facts for audit logs:

```yaml
- name: Release metadata
  run: |
    echo "init=${{ steps.ps_init.outputs.init_metadata }}"
```
