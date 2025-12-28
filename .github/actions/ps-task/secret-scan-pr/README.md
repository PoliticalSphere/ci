# Secrets Scan (PR)

Run fast PR-scoped secret scanning via the canonical task runner.

## Usage

```yaml
- name: Secrets scan (PR)
  uses: ./.github/actions/ps-task/secret-scan-pr
```

## Inputs

- `report_dir`: Report output directory. Default: `reports/security`.
- `log_dir`: Log output directory. Default: `logs/security`.

## Notes

- In CI, the scan requires a base ref (set `PS_BASE_REF` or rely on
  `GITHUB_BASE_REF`). Missing base ref will fail the scan.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
