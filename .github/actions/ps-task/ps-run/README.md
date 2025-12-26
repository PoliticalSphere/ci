# PS Task Runner

Canonical task runner for repository scripts with uniform validation, logs, and
reporting. All task modules must delegate to this action.

## Usage

```yaml
- name: Run task
  uses: ./.github/actions/ps-task/ps-run
  with:
    id: "lint"
    title: "Lint"
    description: "Lint gate"
    script: "tools/scripts/gates/gate-pre-commit.sh"
    require_files: |
      tools/scripts/gates/gate-pre-commit.sh
```

## Inputs

- `id` (required): Machine identifier used for logs/reports.
- `title` (required): Human-readable title.
- `description`: Optional description. Default: empty.
- `script` (required): Repo-relative script path.
- `working_directory`: Repo-relative working directory. Default: `.`.
- `working-directory`: Deprecated alias for `working_directory`.
- `require_files`: Newline-separated required files (repo-relative).
- `artifact_paths`: Newline-separated expected output paths (repo-relative).
- `continue_on_error`: `0` or `1`. Default: `0`.
- `env_kv`: Optional multiline `KEY=VALUE` pairs for controlled env injection.
- `args`: Optional space-separated args passed to the script.
- `allow_args`: `0` or `1` to allow args. Default: `1`.

## Outputs

- `status`: `success` or `failure`.
- `log_path`: `logs/ps-task/<id>.log`.
- `report_path`: `reports/ps-task/<id>.report.json`.
- `duration_ms`: Task duration in milliseconds.
- `exit_code`: Script exit code.

## Notes

- Paths must be repo-relative and must not contain `..` or be absolute.
- Required files are validated before execution.
- Logs and reports are always written to the canonical locations.
