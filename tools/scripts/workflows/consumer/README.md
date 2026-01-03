# Consumer Contract Scripts

Scripts that validate consumer repositories against the declared platform
contract for tooling, scripts, workflows, and path integrity.

## Scripts

- `contract-check.js`: core validation logic (policy-driven, no network calls).
- `contract-check.sh`: bash wrapper that sets paths and writes logs.

## Outputs

- `reports/contracts/contract.json` (structured report)
- `reports/contracts/contract.txt` (human-readable summary)
- `logs/contracts/contract-check.log` (execution log)

## Usage

```bash
bash tools/scripts/consumer/contract-check.sh
```

Policy defaults live under `configs/consumer/`.
JSON is supported out of the box; YAML requires the `yaml` package.
