# Lint

Run the fast lint/validation gate via the canonical task runner.

## Usage

```yaml
- name: Lint
  uses: ./.github/actions/ps-task/lint
```

## Inputs

None.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
