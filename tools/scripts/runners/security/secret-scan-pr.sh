#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Secrets Scan (Fast PR)
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/security/secret-scan-pr.sh
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
# Fast secret scanning for PRs and local gates.
#
# POLICY
# -----------------------------------------------------------------------------
# - In CI: secret scanning is mandatory. If scanner unavailable, CI fails.
# - In CI: requires base ref (PS_BASE_REF or GITHUB_BASE_REF) to scope diff
# - Locally: if scanner not installed, exit cleanly with guidance
#
# IMPLEMENTATION
# -----------------------------------------------------------------------------
# - Primary tool: gitleaks (free, widely used)
# - Config: configs/security/gitleaks.toml
# - Supports platform config linking for consumers
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/security/secret-scan-pr.sh
#   PS_BASE_REF=main bash tools/scripts/runners/security/secret-scan-pr.sh
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
readonly GITLEAKS_ID="security.gitleaks.pr"
readonly GITLEAKS_TITLE="GITLEAKS_PR"
readonly GITLEAKS_DESC="Fast PR secret detection"
readonly GITLEAKS_CONFIG_REL="configs/security/gitleaks.toml"
readonly GITLEAKS_PLATFORM_CONFIG="configs/security/gitleaks.toml"
readonly GITLEAKS_BASELINE=".gitleaksignore"

# -----------------------------------------------------------------------------
# Initialize Security Runner
# -----------------------------------------------------------------------------
security_runner_init "${GITLEAKS_ID}" "${GITLEAKS_TITLE}" "${GITLEAKS_DESC}"

# -----------------------------------------------------------------------------
# Configuration with Platform Fallback
# -----------------------------------------------------------------------------
config_path="${PS_REPO_ROOT}/${GITLEAKS_CONFIG_REL}"

if [[ ! -f "${config_path}" ]]; then
  # Try to link platform config
  if security_link_platform_config "${config_path}" "${GITLEAKS_PLATFORM_CONFIG}"; then
    log_info "Linked platform config to ${config_path}"
  else
    log_error "gitleaks config missing at ${config_path}"
    log_info "HINT: add configs/security/gitleaks.toml or provide PS_PLATFORM_ROOT with the config"
    runner_set_status "ERROR"
    exit 1
  fi
fi

RUNNER_CONFIG="${config_path}"

# -----------------------------------------------------------------------------
# Tool Availability
# -----------------------------------------------------------------------------
if ! command -v gitleaks >/dev/null 2>&1; then
  if [[ "${CI:-0}" == "1" ]]; then
    log_error "gitleaks is required in CI but not found on PATH"
    log_info "HINT: install gitleaks in the CI runner/tooling image"
    runner_set_status "ERROR"
    exit 1
  fi

  log_info "Secrets scan: gitleaks not found (bootstrap mode)"
  log_info "HINT: install gitleaks to enable local secret scanning"
  exit 0
fi

RUNNER_TOOL_BIN="$(command -v gitleaks)"

# Set up baseline
security_set_baseline "${GITLEAKS_BASELINE}"

# Set up report
security_set_report "gitleaks-pr.sarif"

# Require base ref in CI
security_require_base_ref

# -----------------------------------------------------------------------------
# Execute Gitleaks
# -----------------------------------------------------------------------------
log_info "Secrets scan: running gitleaks (fast)..."

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
  log_info "Secrets scan: baseline enabled (${SECURITY_BASELINE_PATH})"
fi

# Determine scan scope based on mode
if [[ "${CI:-0}" == "1" ]]; then
  base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
  log_ref="origin/${base_ref}"
  
  if git rev-parse --verify "${log_ref}" >/dev/null 2>&1; then
    # Diff-based scan
    cmd_args+=("--log-opts=${log_ref}..HEAD")
    security_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
  else
    # Fallback to working tree
    log_info "Secrets scan: missing ${log_ref}; falling back to working tree scan"
    cmd_args+=("--no-git")
    security_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
  fi
else
  # Local: working tree scan
  cmd_args+=("--no-git")
  security_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
fi
