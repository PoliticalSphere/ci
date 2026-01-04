#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Gitleaks History Scan
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/security/gitleaks-history.sh
#   file_type: script
#   language: bash
#   version: 2.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Run a full-history secrets scan using gitleaks.
#
# POLICY
# -----------------------------------------------------------------------------
# - In CI, gitleaks and config are required; fail if missing
# - Supports baseline file for known/accepted findings
# - Generates SARIF report for integration with security dashboards
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/security/gitleaks-history.sh
#   PS_GITLEAKS_SINCE="2024-01-01" bash tools/scripts/runners/security/gitleaks-history.sh
#
# ==============================================================================

# -----------------------------------------------------------------------------
# Bootstrap: Load security runner abstraction
# -----------------------------------------------------------------------------
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/security-runner-base.sh
. "${_script_dir}/../../core/security-runner-base.sh"

# -----------------------------------------------------------------------------
# Runner Configuration
# -----------------------------------------------------------------------------
readonly GITLEAKS_ID="security.gitleaks.history"
readonly GITLEAKS_TITLE="GITLEAKS_HISTORY"
readonly GITLEAKS_DESC="Full history secret detection scan"
readonly GITLEAKS_CONFIG="configs/security/gitleaks.toml"
readonly GITLEAKS_BASELINE=".gitleaksignore"

# -----------------------------------------------------------------------------
# Initialize Security Runner
# -----------------------------------------------------------------------------
security_runner_init "${GITLEAKS_ID}" "${GITLEAKS_TITLE}" "${GITLEAKS_DESC}"

# Verify in git repo
if ! ps_git_has_repo; then
  log_error "Unable to determine repo root (are you in a git repo?)"
  exit 1
fi

# Require configuration
runner_require_config "${GITLEAKS_CONFIG}" "gitleaks config"

# Require tool (CI enforcement)
security_require_in_ci "gitleaks"
runner_require_tool "gitleaks" "" "1"

# Set up baseline
security_set_baseline "${GITLEAKS_BASELINE}"

# Set up report
security_set_report "gitleaks-history.sarif"

# -----------------------------------------------------------------------------
# Execute Gitleaks
# -----------------------------------------------------------------------------
# Build command arguments
declare -a cmd_args=(
  "detect"
  "--source" "${PS_REPO_ROOT}"
  "--config" "${RUNNER_CONFIG}"
  "--report-format" "sarif"
  "--report-path" "${SECURITY_REPORT_PATH}"
  "--redact"
)

# Add baseline args if available
if [[ "${#SECURITY_BASELINE_ARGS[@]:-0}" -gt 0 ]]; then
  cmd_args+=("${SECURITY_BASELINE_ARGS[@]}")
  log_info "Secrets scan (full history): baseline enabled (${SECURITY_BASELINE_PATH})"
fi

# Add log opts if specified (for partial history scan)
if [[ -n "${PS_GITLEAKS_SINCE:-}" ]]; then
  cmd_args+=("--log-opts=--since=${PS_GITLEAKS_SINCE}")
  log_info "Secrets scan (full history): log since ${PS_GITLEAKS_SINCE}"
fi

log_info "Secrets scan (full history): running gitleaks..."

# Execute
security_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
