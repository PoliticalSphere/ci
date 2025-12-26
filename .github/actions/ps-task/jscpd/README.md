# JSCPD

Run duplication detection via the canonical task runner.

## Usage

```yaml
- name: Duplication scan
  uses: ./.github/actions/ps-task/jscpd
```

## Inputs

None.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
