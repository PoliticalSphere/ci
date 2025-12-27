# PS Tools Action Scripts

Helper scripts for the `ps-tools` composite action. These are invoked by
`./.github/actions/ps-bootstrap/ps-tools/action.yml` to keep the action YAML
minimal and deterministic.

## Scripts

- `ps-tools-resolve-root.sh`: Resolve `PS_SCRIPTS_ROOT` from `PS_PLATFORM_ROOT`
  or `GITHUB_WORKSPACE` and validate the expected tools structure.
- `ps-tools-validate-inputs.sh`: Validate `ps-tools` inputs using shared
  branding validators and emit actionable errors.
- `ps-tools-assemble.sh`: Assemble the final tool list from bundle/extra/explicit
  inputs and emit the list via `GITHUB_OUTPUT`.
- `ps-tools-install.sh`: Thin wrapper that calls the installer in
  `tools/scripts/ci/install-tools.sh` with the resolved tool list.

## Contract

- These scripts are deterministic and non-interactive.
- Inputs are passed via environment variables set by the composite action.
- Fail fast with clear errors; prefer `::error::` annotations when possible.
