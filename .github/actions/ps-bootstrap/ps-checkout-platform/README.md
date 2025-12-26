# PS Checkout (Platform)

Security Tier 0: Controlled ingestion of platform-level CI logic. This action
ensures secondary repositories are checked out into a sanctioned, repo-relative
path without compromising workspace integrity.

## Security Features

- Owner enforcement: By default, only repositories owned by `PoliticalSphere`
  are permitted unless an allowlist is supplied.
- Allowlist guardrails: Optional `allowed_repositories` explicitly permits
  specific external or cross-org repos.
- Path traversal protection: Absolute paths and `..` segments are rejected to
  prevent workspace escape or overwrites.
- Pre-flight cleanup: `clean_path` removes existing directories to avoid
  persistence on self-hosted runners.

## Usage

```yaml
- name: Checkout platform
  uses: ./.github/actions/ps-bootstrap/ps-checkout-platform
  with:
    repository: PoliticalSphere/ci
    ref: main
    path: .ps-platform
    fetch_depth: "1"
```

## Inputs

- `repository` (required): Platform repository in `OWNER/REPO` form.
- `ref`: Git ref (branch/tag/SHA). Default: `main`.
- `path`: Repo-relative checkout path. Default: `.ps-platform`.
- `fetch_depth`: Git fetch depth (0 = full history). Default: `1`.
- `persist_credentials`: Persist credentials in git config (`true`|`false`).
  Default: `false`.
- `submodules`: Submodules mode (`false`|`true`|`recursive`). Default: `false`.
- `require_full_history`: Require `fetch_depth=0` (`true`|`false`). Default: `false`.
- `clean_path`: Delete the target path before checkout (`true`|`false`). Default: `false`.
- `allowed_repositories`: Optional newline-separated allowlist of repositories.
  If set, `repository` must be listed. Default: empty.

## Outputs

- `platform_path`: Repo-relative path used for checkout.
- `platform_path_abs`: Absolute path to the platform checkout directory.
- `platform_repository`: Validated platform repository.
- `platform_ref`: Validated platform ref.

## Notes

- `path` must be repo-relative and must not contain `..` or be absolute.
- When `allowed_repositories` is empty, the repository owner must be `PoliticalSphere`.
- When `require_full_history` is `true`, `fetch_depth` must be `0`.

## Operational Logic

- Identity verification: Owner must be `PoliticalSphere` unless allowlisted.
- Sandbox validation: Rejects any path that attempts to escape the workspace.
- Egress compliance: Runs under `ps-harden-runner`; git traffic is subject to
  the established network policy.
- Clean path behavior: When `clean_path` is `false`, `actions/checkout` may
  perform a fetch/reset in an existing directory. For Tier 0 jobs, prefer
  `clean_path: "true"` to enforce a known-good state.
- Stable telemetry: Emits absolute and relative paths for downstream tools.
- Deterministic state: If `clean_path` is `false`, `actions/checkout` may reuse
  an existing directory (fetch/reset instead of a fresh clone). For Tier 0 jobs,
  prefer `clean_path: true` to guarantee a known-good state.

## Key Differentiators

| Logic Gate | Security Value |
| :--- | :--- |
| Owner check | Mitigates repo spoofing by restricting to the trusted org. |
| Clean path | Defends against dirty workspace attacks on persistent runners. |
| Traversal guard | Prevents overwriting `.git` or `.github` in the main repo. |
