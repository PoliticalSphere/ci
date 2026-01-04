# Lint Runners

Deterministic lint scripts used by local gates and CI.

## Architecture

All lint runners use the **runner-base abstraction** (`core/runner-base.sh`)
which provides:

- Automatic mode detection (staged/PR/full scan)
- Target collection based on mode
- Config and tool validation
- Structured logging and status reporting
- Consistent exit code handling

## Scripts

| Script | Tool | Description |
|--------|------|-------------|
| `biome.sh` | Biome | Formatting and correctness checks |
| `eslint.sh` | ESLint | TS-aware linting rules |
| `shellcheck.sh` | ShellCheck | Shell script safety |
| `yamllint.sh` | yamllint | YAML validity |
| `actionlint.sh` | actionlint | GitHub Actions workflow validation |
| `hadolint.sh` | Hadolint | Dockerfile best practices |
| `markdownlint.sh` | markdownlint-cli2 | Markdown quality |
| `cspell.sh` | cspell | Spell checking |
| `knip.sh` | Knip | Unused code detection |

## Creating a New Lint Runner

```bash
#!/usr/bin/env bash
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${_script_dir}/../../core/runner-base.sh"

# Configuration
readonly MY_ID="lint.mytool"
readonly MY_TITLE="MYTOOL"
readonly MY_DESC="Description of what this checks"
readonly MY_CONFIG="configs/lint/mytool.json"
readonly MY_BIN="node_modules/.bin/mytool"
readonly MY_PATTERN="*.js|*.ts"

# Initialize
runner_init "${MY_ID}" "${MY_TITLE}" "${MY_DESC}"
runner_require_config "${MY_CONFIG}"
runner_require_tool "mytool" "${MY_BIN}" "1"
runner_parse_args "$@"

# Collect and check targets
runner_collect_targets "${MY_PATTERN}"
runner_skip_if_no_targets && exit 0

# Execute
runner_exec "${RUNNER_TOOL_BIN}" --config "${RUNNER_CONFIG}" "${RUNNER_TARGETS[@]}"
```

## Execution Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| `staged` | Local pre-commit | Only staged files |
| `pr` | CI with PR context | Only files changed in PR |
| `full` | `PS_FULL_SCAN=1` or CI without PR | All matching files |

## Configuration

All configs live in `configs/lint/`. Each runner requires its config to exist.

## Legacy Support

The `common.sh` file is a **facade** for backward compatibility. New runners
should use `core/runner-base.sh` directly. The facade re-exports legacy
functions for scripts not yet migrated.

