# Security Scripts

Security scanners used by local gates and scheduled CI workflows.

## Scripts

- `secret-scan-pr.sh`: fast PR-oriented secret scan.
- `gitleaks-history.sh`: full-history secret scan.
- `semgrep-validate-inputs.sh`: validate Semgrep CLI inputs for action usage.
- `semgrep-install.sh`: install pinned Semgrep in a virtual environment.
- `semgrep-scan.sh`: run Semgrep and emit SARIF + exit code.
- `semgrep-enforce.sh`: enforce Semgrep exit policy after SARIF upload.
- `trivy-fs.sh`: filesystem scan for vuln/config findings (SARIF).
- `license-check.sh`: dependency license compliance (policy-driven).

## Notes

These scripts require configuration from `configs/security/` and are designed
for deterministic, non-interactive execution.

Secrets scans emit redacted SARIF reports under `reports/security/` for local
review and artifact upload.
