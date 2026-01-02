# PS Task Actions

Canonical task runner and thin task modules for Political Sphere CI.

- `ps-run`: the only execution engine; enforces validation, logs, and reports.
- `build`, `lint`, `typecheck`, `test`, `jscpd`, `consumer-contract`,
  `license-check`, `semgrep-cli`, `secret-scan-pr`: thin modules that delegate to `ps-run`.
- `dependency-review`, `sonarcloud`, `codeql`: thin wrappers around pinned external actions.

## Logs and reports

All tasks emit uniform artifacts:

- `logs/ps-task/<id>.log`
- `reports/ps-task/<id>.report.json`

## Adding a new task

1. Create `.github/actions/ps-task/<task>/action.yml`
2. Point it at a repo script and required files
3. Delegate to `./.github/actions/ps-task/ps-run`
