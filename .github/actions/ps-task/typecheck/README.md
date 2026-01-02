# Typecheck

Run strict TypeScript checks via the canonical task runner.

## Usage

```yaml
- name: Typecheck
  uses: ./.github/actions/ps-task/typecheck
```

## Inputs

None.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
