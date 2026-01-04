#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Security Runner Base
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/core/security-runner-base.sh
#   file_type: script
#   language: bash
#   version: 1.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Extends runner-base.sh with security-specific functionality for security
# scanning tools (gitleaks, trivy, semgrep, etc.).
#
# ADDITIONAL FEATURES
# -----------------------------------------------------------------------------
# - Baseline/allowlist support for secret scanning
# - SARIF report generation and handling
# - Security-specific mode determination (history vs PR vs working tree)
# - Platform config linking for consumers
# - Report directory management
#
# ARCHITECTURE
# -----------------------------------------------------------------------------
#   ┌──────────────────────────────────────────────────────────────────────────┐
#   │                      security-runner-base.sh                              │
#   │  ┌─────────────────────────────────────────────────────────────────────┐ │
#   │  │  Inherits: runner-base.sh (context, targets, exec)                  │ │
#   │  ├─────────────────────────────────────────────────────────────────────┤ │
#   │  │  Security Layer: baselines, SARIF, report paths                     │ │
#   │  ├─────────────────────────────────────────────────────────────────────┤ │
#   │  │  Scan Modes: history, pr-diff, working-tree                         │ │
#   │  └─────────────────────────────────────────────────────────────────────┘ │
#   └──────────────────────────────────────────────────────────────────────────┘
#
# USAGE
# -----------------------------------------------------------------------------
#   #!/usr/bin/env bash
#   set -euo pipefail
#   script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "${script_dir}/../../core/security-runner-base.sh"
#
#   # Initialize security runner
#   security_runner_init "security.gitleaks" "GITLEAKS" "Secret detection"
#
#   # Require config
#   runner_require_config "configs/security/gitleaks.toml" "gitleaks config"
#
#   # Set up baseline
#   security_set_baseline ".gitleaksignore"
#
#   # Set up report
#   security_set_report "gitleaks-pr.sarif"
#
#   # Execute with security-specific handling
#   security_exec gitleaks detect --source "${PS_REPO_ROOT}" ...
#
# ==============================================================================
set -euo pipefail

# Prevent double-sourcing
[[ -n "${_PS_SECURITY_RUNNER_BASE_LOADED:-}" ]] && return 0
_PS_SECURITY_RUNNER_BASE_LOADED=1

# -----------------------------------------------------------------------------
# Load Runner Base
# -----------------------------------------------------------------------------
_security_runner_base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=tools/scripts/core/runner-base.sh
. "${_security_runner_base_dir}/runner-base.sh"

# -----------------------------------------------------------------------------
# Security Runner State
# -----------------------------------------------------------------------------
SECURITY_BASELINE_PATH=""
SECURITY_BASELINE_ARGS=()
SECURITY_REPORT_DIR=""
SECURITY_REPORT_PATH=""
SECURITY_SCAN_MODE=""  # "history", "pr", "working-tree"
SECURITY_SKIP="${PS_SKIP_SECURITY_SCAN:-0}"

export SECURITY_BASELINE_PATH SECURITY_REPORT_PATH SECURITY_SCAN_MODE

# -----------------------------------------------------------------------------
# Initialization
# -----------------------------------------------------------------------------

# security_runner_init <id> <title> [description]
# Initialize security runner with security-specific defaults
security_runner_init() {
  local id="${1:?security_runner_init requires id}"
  local title="${2:?security_runner_init requires title}"
  local desc="${3:-}"

  # Check global skip flag
  if [[ "${SECURITY_SKIP}" == "1" ]]; then
    log_info "${title}: skipped (PS_SKIP_SECURITY_SCAN=1)"
    exit 0
  fi

  # Initialize base runner
  runner_init "${id}" "${title}" "${desc}"

  # Set up report directory
  SECURITY_REPORT_DIR="${PS_REPORT_DIR:-${PS_REPO_ROOT}/reports/security}"
  mkdir -p "${SECURITY_REPORT_DIR}"

  # Determine security-specific scan mode
  _security_determine_mode

  log_debug "Security runner initialized (scan_mode=${SECURITY_SCAN_MODE})"
  return 0
}

# Determine security scan mode
_security_determine_mode() {
  # Full history scan
  if [[ "${PS_FULL_HISTORY_SCAN:-0}" == "1" ]]; then
    SECURITY_SCAN_MODE="history"
    return 0
  fi

  # PR mode in CI
  if [[ "${CI:-0}" == "1" ]]; then
    local base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
    if [[ -n "${base_ref}" ]]; then
      SECURITY_SCAN_MODE="pr"
      return 0
    fi
  fi

  # Default to working tree
  SECURITY_SCAN_MODE="working-tree"
  return 0
}

# -----------------------------------------------------------------------------
# Baseline Support
# -----------------------------------------------------------------------------

# security_set_baseline <relative_path>
# Set baseline/allowlist file for ignoring known findings
security_set_baseline() {
  local relative_path="${1:?security_set_baseline requires path}"
  local full_path="${PS_REPO_ROOT}/${relative_path}"

  SECURITY_BASELINE_PATH=""
  SECURITY_BASELINE_ARGS=()

  if [[ -f "${full_path}" ]]; then
    SECURITY_BASELINE_PATH="${full_path}"
    SECURITY_BASELINE_ARGS=("--baseline-path" "${full_path}")
    log_debug "Baseline enabled: ${full_path}"
  else
    log_debug "No baseline file found at: ${full_path}"
  fi

  return 0
}

# security_get_baseline_args
# Get baseline arguments for tool command
security_get_baseline_args() {
  printf '%s\n' "${SECURITY_BASELINE_ARGS[@]:-}"
}

# -----------------------------------------------------------------------------
# Report Management
# -----------------------------------------------------------------------------

# security_set_report <filename>
# Set up SARIF report path
security_set_report() {
  local filename="${1:?security_set_report requires filename}"
  SECURITY_REPORT_PATH="${SECURITY_REPORT_DIR}/${filename}"
  log_debug "Report path: ${SECURITY_REPORT_PATH}"
  return 0
}

# security_report_exists
# Check if report file exists
security_report_exists() {
  [[ -f "${SECURITY_REPORT_PATH}" ]]
}

# security_summarize_sarif
# Print summary of SARIF findings
security_summarize_sarif() {
  local report_path="${1:-${SECURITY_REPORT_PATH}}"

  [[ -f "${report_path}" ]] || return 0

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "${report_path}"
import json
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        sarif = json.load(f)
except Exception as e:
    print(f"PS.SECURITY: report_error={e}")
    sys.exit(0)

results = []
for run in sarif.get("runs", []):
    results.extend(run.get("results", []))

files = set()
for res in results:
    for loc in res.get("locations", []):
        uri = (
            loc.get("physicalLocation", {})
            .get("artifactLocation", {})
            .get("uri")
        )
        if uri:
            files.add(uri)

print(f"PS.SECURITY: findings={len(results)} files={len(files)}")
PY
  fi

  return 0
}

# -----------------------------------------------------------------------------
# Platform Config Linking
# -----------------------------------------------------------------------------

# security_link_platform_config <config_path> <platform_config_path>
# Link platform config if local config missing (for consumers)
security_link_platform_config() {
  local config_path="${1:?config_path required}"
  local platform_config="${2:?platform_config required}"

  if [[ -f "${config_path}" ]]; then
    return 0
  fi

  local platform_root="${PS_PLATFORM_ROOT:-${PS_REPO_ROOT}/.ps-platform}"
  local full_platform_config="${platform_root}/${platform_config}"

  if [[ -f "${full_platform_config}" ]]; then
    mkdir -p "$(dirname "${config_path}")"
    ln -s "${full_platform_config}" "${config_path}"
    log_info "Linked platform config: ${config_path} -> ${full_platform_config}"
    return 0
  fi

  return 1
}

# -----------------------------------------------------------------------------
# Execution Helpers
# -----------------------------------------------------------------------------

# security_exec <command...>
# Execute security tool with logging and SARIF summary
security_exec() {
  local rc=0
  
  RUNNER_STATUS="RUNNING"
  
  set +e
  "$@"
  rc=$?
  set -e

  # Evaluate status
  if [[ ${rc} -eq 0 ]]; then
    RUNNER_STATUS="PASS"
  else
    RUNNER_STATUS="FAIL"
  fi

  # Summarize findings if SARIF report exists
  if security_report_exists; then
    security_summarize_sarif
  fi

  _runner_finish_with_status "${RUNNER_STATUS}" "${rc}"
  return ${rc}
}

# security_exec_pr_mode <tool_cmd...>
# Execute tool in PR/diff mode with proper log-opts
security_exec_pr_mode() {
  local base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
  
  if [[ -z "${base_ref}" ]]; then
    log_error "base ref is required for PR security scanning"
    log_info "HINT: set PS_BASE_REF or GITHUB_BASE_REF"
    runner_set_status "ERROR"
    exit 1
  fi

  local log_ref="origin/${base_ref}"
  
  if git rev-parse --verify "${log_ref}" >/dev/null 2>&1; then
    # Diff-based scan
    security_exec "$@" --log-opts="${log_ref}..HEAD"
  else
    log_info "Missing ${log_ref}; falling back to working tree scan"
    security_exec "$@" --no-git
  fi
}

# security_get_log_opts
# Get git log options for scan scope
security_get_log_opts() {
  case "${SECURITY_SCAN_MODE}" in
    history)
      if [[ -n "${PS_GITLEAKS_SINCE:-}" ]]; then
        echo "--log-opts=--since=${PS_GITLEAKS_SINCE}"
      fi
      ;;
    pr)
      local base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
      if [[ -n "${base_ref}" ]]; then
        local log_ref="origin/${base_ref}"
        if git rev-parse --verify "${log_ref}" >/dev/null 2>&1; then
          echo "--log-opts=${log_ref}..HEAD"
        fi
      fi
      ;;
  esac
  return 0
}

# security_should_use_no_git
# Check if should use --no-git flag (working tree only)
security_should_use_no_git() {
  case "${SECURITY_SCAN_MODE}" in
    working-tree)
      return 0
      ;;
    pr)
      local base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
      if [[ -n "${base_ref}" ]]; then
        local log_ref="origin/${base_ref}"
        if ! git rev-parse --verify "${log_ref}" >/dev/null 2>&1; then
          return 0
        fi
      fi
      ;;
  esac
  return 1
}

# -----------------------------------------------------------------------------
# CI-Specific Enforcement
# -----------------------------------------------------------------------------

# security_require_in_ci
# Enforce that security tools are available in CI
security_require_in_ci() {
  local tool_name="${1:?tool_name required}"
  
  if [[ "${CI:-0}" == "1" ]] && ! command -v "${tool_name}" >/dev/null 2>&1; then
    log_error "${tool_name} is required in CI but not found on PATH"
    log_info "HINT: install ${tool_name} in the CI runner/tooling image"
    runner_set_status "ERROR"
    exit 1
  fi
  
  return 0
}

# security_require_base_ref
# Enforce base ref in CI for PR scanning
security_require_base_ref() {
  if [[ "${CI:-0}" == "1" && "${SECURITY_SCAN_MODE}" == "pr" ]]; then
    local base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
    if [[ -z "${base_ref}" ]]; then
      log_error "base ref is required for CI security scanning"
      log_info "HINT: set PS_BASE_REF or GITHUB_BASE_REF to the PR base branch"
      runner_set_status "ERROR"
      exit 1
    fi
  fi
  return 0
}

return 0
