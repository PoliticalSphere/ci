<!--
# ==============================================================================
# Political Sphere — License Compliance (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for license compliance checks.
#
# Dependencies:
#   - ./.github/actions/ps-task/ps-run
#   - tools/scripts/security/license-check.sh
#   - tools/scripts/security/license-check.js
#   - configs/security/license-policy.yml (default policy)
#
# Dependents:
#   - Workflow jobs that invoke license-check for compliance gating
# ==============================================================================
-->

# License Compliance

Security Tier 1: Policy-driven OSS license enforcement via the PS task runner.

Check dependency licenses against the platform policy via the canonical task
runner.

## Usage

```yaml
- name: License compliance
  uses: ./.github/actions/ps-task/license-check
  with:
    policy_path: configs/security/license-policy.yml
    lock_path: package-lock.json
```

## Inputs

- `policy_path`: License policy path. Default: `configs/security/license-policy.yml`.
- `lock_path`: Lockfile path. Default: `package-lock.json`.
- `report_dir`: Report output directory. Default: `reports/security`.
- `log_dir`: Log output directory. Default: `logs/security`.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.
