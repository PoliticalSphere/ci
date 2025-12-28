# CI Validate

Run the Validate-CI policy gate using a checked-out platform repository. The
action is strict and fails fast on missing inputs or paths.

## Usage

```yaml
- name: Validate CI
  uses: ./.github/actions/ps-ci-validate
  with:
    platform_root: ${{ env.PS_PLATFORM_ROOT }}
```

## Inputs

- `platform_root`: Absolute path to the platform checkout. If empty, the action
  reads `PS_PLATFORM_ROOT` from the environment. Default: empty.
- `script_relpath`: Script path relative to the repository root. Default:
  `tools/scripts/ci/validate-ci-action.sh`.

## Outputs

- `platform_root`: Resolved platform root used for validation.

## Notes

- The platform repository must already be checked out.
- `platform_root` must be an absolute path.
- `script_relpath` is resolved against `GITHUB_WORKSPACE` and must exist.
