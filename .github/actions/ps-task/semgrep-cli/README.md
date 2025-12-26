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
- `fail_on_findings`: `true` or `false`. Default: `true`.

## Outputs

Outputs are provided by `ps-task/ps-run`:

- `status`, `log_path`, `report_path`, `duration_ms`, `exit_code`.

## Notes

- Requires `GITHUB_TOKEN` and `security-events: write` in the calling job.
