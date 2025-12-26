<!--
# ==============================================================================
# Political Sphere — PS Task Runner (ps-run) (README)
# ------------------------------------------------------------------------------
# Purpose:
#   Security contract and operational guidance for the PS Task Runner.
#
# Dependencies:
#   - tools/scripts/ci/emit-report.py (optional, when python3 is available)
#
# Dependents:
#   - ./.github/actions/ps-task/semgrep-cli
#   - ./.github/actions/ps-task/license-check
#   - ./.github/actions/ps-task/ps-run (self)
# ==============================================================================
-->

# PS Task Runner (ps-run)

Security Tier 1: The canonical execution engine for Political Sphere tasks.
This action wraps scripts with mandatory path-safety checks, uniform logging,
and telemetry-rich JSON reporting.

## Key Security Controls

- Workspace sandbox: resolves real paths and ensures scripts, required files,
  and artifacts remain under the repository root.
- Path jail: canonicalizes paths and blocks any reference outside the workspace
  (including `../` traversal attempts).
- Word-split protection: arguments are newline-separated and loaded into a bash
  array, preventing accidental splitting or injection.
- Fail-fast artifacts: optional `strict_artifacts` enforcement ensures every
  declared output pattern matches at least one file.
- Audit-ready logs: all output is captured to a task log and a JSON report is
  generated on exit.
- Deterministic telemetry: every run emits a task report and log entry, even on
  failure, for forensics.

## Task Lifecycle

1. Preflight: validate inputs, resolve paths, and verify required files.
2. Execute: run the script in the working directory with controlled env/args.
3. Postflight: write the report JSON, enforce artifact expectations, emit outputs.

## Env Injection vs GitHub env

- `env_kv` is the safe injection method: key/value pairs are validated and
  captured in the task report, providing telemetry visibility.
- `env:` blocks at the workflow/step level still work, but they are not
  automatically surfaced in the ps-run report.

## Usage

```yaml
- name: Run security scan
  uses: ./.github/actions/ps-task/ps-run
  with:
    id: "gitleaks-scan"
    title: "Secrets Detection"
    script: "tools/scripts/security/gitleaks.sh"
    args: |
      --verbose
      --report-path=./reports/gitleaks.json
    artifact_paths: |
      reports/gitleaks.json
    strict_artifacts: "1"
```

## Inputs

- `id` (required): Unique task identifier used for logs/reports.
- `title` (required): Human-readable title.
- `description`: Optional description. Default: empty.
- `script` (required): Repo-relative script path.
- `working_directory`: Repo-relative working directory. Default: `.`.
- `working-directory`: Deprecated alias for `working_directory`.
- `require_files`: Newline-separated required files (repo-relative).
- `artifact_paths`: Newline-separated expected output paths (repo-relative).
- `strict_artifacts`: `0` or `1`. Require each artifact glob to match. Default: `0`.
- `continue_on_error`: `0` or `1`. Default: `0`.
- `env_kv`: Optional multiline `KEY=VALUE` pairs for controlled env injection.
- `args`: Newline-separated args passed to the script (one per line).
- `allow_args`: `0` or `1` to allow args. Default: `1`.

## Outputs

- `status`: `success` or `failure`.
- `log_path`: `logs/ps-task/<id>.log`.
- `report_path`: `reports/ps-task/<id>.report.json`.
- `duration_ms`: Task duration in milliseconds.
- `exit_code`: Script exit code.

## Operational Note

This action is intended to be the only way repository scripts run in CI. Avoid
direct `run: bash script.sh` steps so all tasks are captured in centralized
telemetry.
