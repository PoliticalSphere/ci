# Core Script Library

Centralized bash modules providing the foundation for all scripts under `/tools/scripts`.

## Architecture

```
core/
├── bootstrap.sh           # Single entry point - loads all core modules
├── runner-base.sh         # High-level abstraction for tool runners
├── security-runner-base.sh # Security-specific runner extensions
│
├── config.sh              # Centralized configuration
├── logging.sh             # Standardized logging functions
├── error-handler.sh       # Error handling (fail/die)
│
├── path-resolution.sh     # Repo root discovery
├── path-validation.sh     # Path security validation
├── git.sh                 # Git helpers
│
├── validation.sh          # Input validation utilities
├── gha-helpers.sh         # GitHub Actions helpers
│
├── time-helpers.sh        # Date/time utilities
├── string.sh              # String utilities
├── egress.sh              # Network egress allowlist
│
├── gate-logging.sh        # Gate lifecycle logging
├── lint-runner.sh         # Lint step execution
├── lint-summary.sh        # Lint summary UI
├── step-runner.sh         # Generic step execution
├── trap-handlers.sh       # Error trapping
│
├── cli.js                 # Node.js CLI helpers
├── config-manager.js      # Configuration management
├── regex.js               # Regex utilities
└── safe-path.js           # Safe path handling (Node.js)
```

## Module Layers

### Layer 1: Foundation
- **config.sh** - Log levels, feature flags, CI detection
- **logging.sh** - Consistent log_debug/info/warn/error
- **error-handler.sh** - fail() and die() functions

### Layer 2: Path & Validation
- **path-resolution.sh** - ps_resolve_repo_root(), PS_REPO_ROOT
- **path-validation.sh** - safe_relpath(), require_safe_relpath()
- **validation.sh** - require_bool(), require_enum(), etc.

### Layer 3: Abstractions
- **runner-base.sh** - High-level runner abstraction for lint/build tools
- **security-runner-base.sh** - Security scanner abstraction
- **bootstrap.sh** - Single entry point that loads everything

## Usage

### Quick Start (Recommended)

For new scripts, use `bootstrap.sh` for automatic loading:

```bash
#!/usr/bin/env bash
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_find_bootstrap() {
  local dir="$1"
  while [[ ! -f "${dir}/core/bootstrap.sh" ]] && [[ "${dir}" != "/" ]]; do
    dir="${dir%/*}"
  done
  echo "${dir}/core/bootstrap.sh"
}
. "$(_find_bootstrap "${_script_dir}")"

# All core modules are now available
log_info "Script started"
```

### For Runners (Lint/Build/Security)

Use the runner abstraction for tool execution:

```bash
#!/usr/bin/env bash
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${_script_dir}/../../core/runner-base.sh"

# Initialize runner
runner_init "lint.mytool" "MYTOOL" "Description"

# Require config and tool
runner_require_config "configs/lint/mytool.yaml"
runner_require_tool "mytool" "node_modules/.bin/mytool" "1"

# Collect targets (auto-detects mode: staged/pr/full)
runner_collect_targets "*.js|*.ts"
runner_skip_if_no_targets && exit 0

# Execute
runner_exec "${RUNNER_TOOL_BIN}" --config "${RUNNER_CONFIG}" "${RUNNER_TARGETS[@]}"
```

### For Security Scanners

Use the security runner extension:

```bash
#!/usr/bin/env bash
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${_script_dir}/../../core/security-runner-base.sh"

security_runner_init "security.scanner" "SCANNER" "Security scanning"
runner_require_config "configs/security/scanner.toml"
runner_require_tool "scanner" "" "1"

security_set_baseline ".scannerignore"
security_set_report "scanner.sarif"

security_exec "${RUNNER_TOOL_BIN}" scan --config "${RUNNER_CONFIG}"
```

## Key Exports

### From runner-base.sh

| Variable | Description |
|----------|-------------|
| `RUNNER_ID` | Runner identifier |
| `RUNNER_TITLE` | Display title |
| `RUNNER_MODE` | Execution mode: staged/pr/full |
| `RUNNER_TARGETS` | Array of target files |
| `RUNNER_CONFIG` | Path to config file |
| `RUNNER_TOOL_BIN` | Path to tool binary |
| `RUNNER_STATUS` | Current status |

| Function | Description |
|----------|-------------|
| `runner_init()` | Initialize runner context |
| `runner_require_config()` | Require config file |
| `runner_require_tool()` | Require tool binary |
| `runner_collect_targets()` | Collect files based on mode |
| `runner_skip_if_no_targets()` | Skip if no targets |
| `runner_exec()` | Execute tool with logging |

### From security-runner-base.sh

| Function | Description |
|----------|-------------|
| `security_runner_init()` | Initialize security runner |
| `security_set_baseline()` | Set baseline/allowlist |
| `security_set_report()` | Set SARIF report path |
| `security_exec()` | Execute with SARIF summary |

## Design Principles

1. **Single Source of Truth** - Each concern has exactly one module
2. **Dependency Order** - Modules are loaded in correct order by bootstrap
3. **Double-Source Prevention** - All modules guard against double-loading
4. **Backward Compatibility** - Legacy interfaces maintained via facades
5. **High-Level Abstractions** - runner-base.sh eliminates boilerplate

