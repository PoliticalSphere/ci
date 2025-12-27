# Build (PS)

Run deterministic build steps via the canonical task runner.

## Usage

```yaml
- name: Build
  uses: ./.github/actions/ps-task/build
  with:
    working_directory: "."
```

## Inputs

- `id`: Task id for logs/reports. Default: `build`.
- `title`: Human-readable title. Default: `Build`.
- `description`: Short description. Default: `Deterministic build`.
- `working_directory`: Repo-relative working directory. Default: `.`.
- `working-directory`: Deprecated alias for `working_directory`.
- `script`: Repo-relative build script. Default: `tools/scripts/actions/ps-build/build.sh`.
- `args`: Optional space-separated args passed to the script.
- `allow_args`: `0` or `1` to allow args. Default: `1`.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
