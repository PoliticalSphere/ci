<!--
# ==============================================================================
# Political Sphere — Semgrep CLI (SARIF) (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for Semgrep CLI (SARIF).
#
# Dependencies:
#   - ./.github/actions/ps-task/ps-run
#   - tools/scripts/runners/security/semgrep/cli.sh
#   - tools/scripts/runners/security/semgrep/validate-inputs.sh
#   - tools/scripts/runners/security/semgrep/install.sh
#   - tools/scripts/runners/security/semgrep/scan.sh
#   - tools/scripts/runners/security/semgrep/enforce.sh
#
# Dependents:
#   - ./.github/workflows/security-scheduled.yml
# ==============================================================================
-->

# Semgrep CLI (SARIF)

Run Semgrep via a pinned install, produce SARIF, and upload to code scanning via
the canonical task runner.

## Usage

```yaml
- name: Semgrep
  uses: ./.github/actions/ps-task/semgrep-cli
  with:
    version: "1.461.0"
    config: "p/ci"
    output: "reports/semgrep/semgrep.sarif"
```

## Inputs

- `version` (required): Pinned Semgrep version (SemVer).
- `config`: Semgrep config (e.g., `p/ci` or a local config path). Default: `p/ci`.
- `path`: Scan path (repo-relative). Default: `.`.
- `output`: SARIF output path. Default: `reports/semgrep/semgrep.sarif`.
- `semgrep_sha256`: Optional SHA-256 checksum for the Semgrep package artifact.
- `fail_on_findings`: `true` or `false`. Default: `true`.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.

## Notes

- Requires `GITHUB_TOKEN` and `security-events: write` in the calling job.
