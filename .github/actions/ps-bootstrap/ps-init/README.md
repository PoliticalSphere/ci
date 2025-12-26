# PS Init

Canonical CI bootstrap switchboard for the Political Sphere ecosystem. It
hardens the runner, checks out the repo, isolates HOME, and optionally checks
out the platform repo and installs tools.

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

## Inputs

Security hardening:
- `egress_policy`: Egress policy for harden-runner (`audit`|`block`). Default: `audit`.

Repository checkout:
- `fetch_depth`: Git fetch depth (0 = full history). Default: `1`.
- `checkout_ref`: Optional git ref (branch/tag/SHA). Default: empty.
- `require_full_history`: Require `fetch_depth=0` (`0/1/true/false`). Default: `false`.

HOME isolation:
- `home_dir`: Repo-relative HOME directory to create/use. Default: `.home`.

Platform checkout (optional):
- `platform_repo`: Platform repository (`OWNER/REPO`). Default: `PoliticalSphere/ci`.
- `platform_ref`: Platform ref. Default: `main`.
- `platform_path`: Repo-relative platform checkout path. Default: `.ps-platform`.
- `skip_platform_checkout`: Skip platform checkout (`0/1/true/false`). Default: `false`.
- `platform_fetch_depth`: Platform fetch depth (0 = full history). Default: `1`.
- `platform_clean_path`: Delete platform_path before checkout (`0/1/true/false`). Default: `false`.
- `platform_allowed_repositories`: Optional newline-separated allowlist for `platform_repo`. Default: empty.

Tools (optional):
- `install_tools`: Install tool bundles (`0/1/true/false`). Default: `0`.
- `tools_bundle`: Tools bundle (`lint`|`security`|`none`). Default: `none`.

## Outputs

- `repo_root`: Resolved repository root (`GITHUB_WORKSPACE`).
- `home_dir`: Absolute path to the HOME directory used by the job.
- `platform_root`: Absolute path to the platform checkout, or empty when skipped.
- `platform_enabled`: `true` when platform checkout ran, else `false`.

## Behavior

- `ps-harden-runner` runs first with no steps before it.
- Boolean toggles accept `0/1/true/false` and are normalized.
- Repo-relative paths must not be absolute or contain `..`.
- When platform checkout runs, `PS_PLATFORM_ROOT` is exported to the job env.
