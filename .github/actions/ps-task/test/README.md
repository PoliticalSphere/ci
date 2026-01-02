# Test

Run deterministic unit tests via the canonical task runner.

## Usage

```yaml
- name: Unit tests
  uses: ./.github/actions/ps-task/test
```

## Inputs

None.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
