#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — GitHub Actions Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Consolidated helpers for GitHub Actions environments:
#   - Heredoc-safe environment variable and output emission
#   - Scripts root resolution for action entrypoints
#
# Functions:
#   emit_env             - Write multiline-safe env var to GITHUB_ENV
#   emit_output          - Write multiline-safe output to GITHUB_OUTPUT
#   resolve_scripts_root - Resolve and export PS_SCRIPTS_ROOT
#
# Usage:
#   # shellcheck source=tools/scripts/core/gha-helpers.sh
#   . "${scripts_root}/tools/scripts/core/gha-helpers.sh"
#
# Sourced by:
#   - Action entrypoints (action.yml run scripts)
#   - Bootstrap scripts
# ==============================================================================
[[ -n "${_PS_GHA_HELPERS_LOADED:-}" ]] && return 0
_PS_GHA_HELPERS_LOADED=1

# ==============================================================================
# Heredoc-safe emission (prevents injection attacks)
# ==============================================================================

# _emit_heredoc <target_file> <key> <value> <prefix>
# Internal helper for heredoc-safe emission
_emit_heredoc() {
  local target_file="$1"
  local key="$2"
  local value="$3"
  local prefix="$4"
  local sanitized delimiter attempts max_attempts

  max_attempts="${MAX_HEREDOC_DELIMITER_ATTEMPTS:-6}"
  sanitized="${value//$'\r'/}"
  delimiter="__PS_${prefix}_${RANDOM}_${RANDOM}__"
  attempts=0

  while [[ "${sanitized}" == *"${delimiter}"* ]]; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -gt "${max_attempts}" ]]; then
      printf 'ERROR: value for %s contains an unsafe heredoc delimiter\n' "${key}" >&2
      exit 1
    fi
    delimiter="__PS_${prefix}_${RANDOM}_${RANDOM}__"
  done

  printf '%s<<%s\n%s\n%s\n' "${key}" "${delimiter}" "${sanitized}" "${delimiter}" >> "${target_file}"
  return 0
}

# emit_env <key> <value>
# Write a multiline-safe environment variable to GITHUB_ENV
emit_env() {
  local key="$1"
  local value="$2"
  _emit_heredoc "${GITHUB_ENV}" "${key}" "${value}" "ENV"
  return 0
}

# emit_output <key> <value>
# Write a multiline-safe step output to GITHUB_OUTPUT
emit_output() {
  local key="$1"
  local value="$2"
  _emit_heredoc "${GITHUB_OUTPUT}" "${key}" "${value}" "OUT"
  return 0
}

# ==============================================================================
# Scripts root resolution
# ==============================================================================

# resolve_scripts_root
# Resolve the platform/workspace root containing tools/scripts and export it
resolve_scripts_root() {
  local workspace_root="${PS_WORKSPACE_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"
  local platform_root="${PS_PLATFORM_ROOT:-}"
  local scripts_root_local=""

  if [[ -n "${PS_SCRIPTS_ROOT:-}" ]]; then
    scripts_root_local="${PS_SCRIPTS_ROOT}"
  elif [[ -n "${platform_root}" && -d "${platform_root}" ]]; then
    scripts_root_local="${platform_root%/}"
  else
    scripts_root_local="${workspace_root%/}"
  fi

  if [[ ! -d "${scripts_root_local}/tools/scripts" ]]; then
    printf 'ERROR: Resolved scripts root (%s) does not contain expected tools/scripts directory.\n' "${scripts_root_local}" >&2
    return 1
  fi

  # Export as env for callers to rely on and compat with existing code
  printf 'PS_SCRIPTS_ROOT=%s\n' "${scripts_root_local}" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
  export PS_SCRIPTS_ROOT="${scripts_root_local}"

  # Also write to GITHUB_OUTPUT if available for actions that expect outputs
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf 'scripts_root=%s\n' "${scripts_root_local}" >> "${GITHUB_OUTPUT}"
  fi

  printf 'PS.RESOLVE: scripts_root=%s\n' "${scripts_root_local}"
  return 0
}
