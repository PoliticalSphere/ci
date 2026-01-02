# Consumer Contract

Validate consumer repositories against the platform contract policy via the
canonical task runner.

## Usage

```yaml
- name: Consumer contract
  uses: ./.github/actions/ps-task/consumer-contract
  with:
    policy_path: configs/consumer/contract.json
```

## Inputs

- `policy_path`: Contract policy path. Default: `configs/consumer/contract.json`.
- `exceptions_path`: Exceptions policy path. Default: `configs/consumer/exceptions.json`.
- `report_path`: Report output path. Default: `reports/contracts/contract.json`.
- `summary_path`: Summary output path. Default: `reports/contracts/contract.txt`.
- `log_dir`: Log output directory. Default: `logs/contracts`.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
