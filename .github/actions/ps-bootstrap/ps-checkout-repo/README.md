# PS Checkout (Repo)

Checkout the current repository with validated inputs and a pinned
`actions/checkout` dependency.

## Usage

```yaml
- name: Checkout repo
  uses: ./.github/actions/ps-bootstrap/ps-checkout-repo
  with:
    fetch_depth: "1"
```

## Inputs

- `fetch_depth`: Git fetch depth (0 = full history). Default: `1`.
- `ref`: Optional git ref (branch/tag/SHA). Default: empty.
- `persist_credentials`: Persist credentials in git config (`true`|`false`).
  Default: `false`.
- `submodules`: Submodules mode (`false`|`true`|`recursive`). Default: `false`.
- `require_full_history`: Require `fetch_depth=0` (`true`|`false`). Default: `false`.

## Notes

- When `require_full_history` is `true`, `fetch_depth` must be `0`.
