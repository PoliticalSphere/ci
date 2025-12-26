# PS Checkout (Platform)

Checkout a platform repository into a controlled, repo-relative path with
validated inputs and stable outputs.

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
- When `require_full_history` is `true`, `fetch_depth` must be `0`.
