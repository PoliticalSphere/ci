# Security Runners

Security scanners used by local gates and scheduled CI workflows.

## Architecture

Security runners use the **security-runner-base abstraction**
(`core/security-runner-base.sh`) which extends `runner-base.sh` with:

- Baseline/allowlist support for known findings
- SARIF report generation and summarization
- Security-specific scan modes (history/PR/working-tree)
- Platform config linking for consumers
- CI enforcement (tools required, base ref required)

## Scripts

| Script | Tool | Description |
|--------|------|-------------|
| `secret-scan-pr.sh` | gitleaks | Fast PR-oriented secret scan |
| `gitleaks-history.sh` | gitleaks | Full-history secret scan |
| `trivy-fs.sh` | Trivy | Filesystem vuln/config scan |
| `license-check.sh` | custom | Dependency license compliance |
| `evasion-scan.js` | Node.js | Lint-evasion pattern detection |
| `sarif-upload.sh` | - | SARIF upload helper |

### Semgrep Scripts

| Script | Description |
|--------|-------------|
| `semgrep/validate-inputs.sh` | Validate Semgrep CLI inputs |
| `semgrep/install.sh` | Install pinned Semgrep |
| `semgrep/scan.sh` | Run Semgrep and emit SARIF |
| `semgrep/enforce.sh` | Enforce exit policy after SARIF |

## Creating a New Security Runner

```bash
#!/usr/bin/env bash
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${_script_dir}/../../core/security-runner-base.sh"

# Initialize
security_runner_init "security.scanner" "SCANNER" "Security scanning"

# Config and tool
runner_require_config "configs/security/scanner.toml"
runner_require_tool "scanner" "" "1"

# Baseline and report
security_set_baseline ".scannerignore"
security_set_report "scanner.sarif"

# CI enforcement
security_require_in_ci "scanner"
security_require_base_ref

# Execute
security_exec "${RUNNER_TOOL_BIN}" scan \
  --config "${RUNNER_CONFIG}" \
  --report "${SECURITY_REPORT_PATH}" \
  "${SECURITY_BASELINE_ARGS[@]}"
```

## Scan Modes

| Mode | Variable | Behavior |
|------|----------|----------|
| `history` | `PS_FULL_HISTORY_SCAN=1` | Full git history |
| `pr` | CI with base ref | Diff from base to HEAD |
| `working-tree` | Default local | Current working tree only |

## Evasion Scanner

The evasion scanner (`evasion-scan.js`) detects patterns that bypass linting:

- `@ts-ignore` / `@ts-expect-error` (TypeScript)
- `eslint-disable` / `biome-ignore` directives
- Explicit `any` type usage
- `shellcheck disable` directives
- File-level complexity estimation

Run: `npm run evasion-scan` or `node tools/scripts/runners/security/evasion-scan.js`

Output: `reports/evasion/evasion-scan.json`

## Configuration

All configs live in `configs/security/`. Runners support platform config
linking for consumers that don't have their own configs.

## Reports

SARIF reports are written to `reports/security/` for:
- Local review
- CI artifact upload
- Security dashboard integration

