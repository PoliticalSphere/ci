# Security Scripts

Security scanners used by local gates and scheduled CI workflows.

## Scripts

- `secret-scan-pr.sh`: fast PR-oriented secret scan.
- `gitleaks-history.sh`: full-history secret scan.
- `trivy-fs.sh`: filesystem scan for vuln/config findings (SARIF).
- `license-check.sh`: dependency license compliance (policy-driven).

## Notes

These scripts require configuration from `configs/security/` and are designed
for deterministic, non-interactive execution.

Secrets scans emit redacted SARIF reports under `reports/security/` for local
review and artifact upload.
