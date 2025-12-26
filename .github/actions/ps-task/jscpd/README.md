# JSCPD

Run duplication detection via the canonical task runner.

## Usage

```yaml
- name: Duplication scan
  uses: ./.github/actions/ps-task/jscpd
```

## Inputs

- `threshold`: Duplication threshold percentage. Default: `5`.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
