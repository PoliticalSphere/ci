#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Script Common Helpers (Canonical Base)
# ------------------------------------------------------------------------------
# Purpose:
#   Single shared foundation for tools/scripts/** bash scripts.
#
# Provides:
#   - repo_root discovery (via core/path-resolution.sh - single source of truth)
#   - best-effort loading of branding/format.sh
#   - consistent detail/info/warn/error helpers
#   - command requirement checks
#   - retry helper for transient failures
#
# Contract:
#   - EXPORTED: REPO_ROOT (canonical); legacy shell variable $repo_root is also set for
#     backwards compatibility but is intentionally **not exported** as an environment
#     variable to encourage use of the ALL_CAPS exported name.
# ==============================================================================

_common_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# shellcheck source=tools/scripts/core/path-resolution.sh
. "${_common_script_dir}/path-resolution.sh"

# ----------------------------
# Retry helper for transient failures
# ----------------------------
# retry_cmd <retries> <sleep_seconds> <command...>
# Rationale: mitigate transient network failures without masking real errors.
retry_cmd() {
  local retries="$1"
  local sleep_s="$2"
  shift 2

  local attempt=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [[ "${attempt}" -ge "${retries}" ]]; then
      return 1
    fi
    sleep "${sleep_s}"
    attempt=$((attempt + 1))
  done
}

# Load shared fail()/die() helper before format.sh so format.sh's ps_error can be used
# shellcheck source=tools/scripts/core/error-handler.sh
. "${_common_script_dir}/fail.sh"

# Legacy compatibility: map paths.sh exports to common.sh expected names
REPO_ROOT="${PS_REPO_ROOT}"
# shellcheck disable=SC2034
repo_root="${PS_REPO_ROOT}"
# shellcheck disable=SC2034
has_git=0
if ps_git_has_repo; then
  # shellcheck disable=SC2034
  has_git=1
fi
format_loaded=0

export REPO_ROOT

set_repo_root() {
  # Re-resolve using paths.sh functions for callers that need to refresh
  PS_REPO_ROOT="$(ps_resolve_repo_root)"
  REPO_ROOT="${PS_REPO_ROOT}"
  # shellcheck disable=SC2034
  repo_root="${REPO_ROOT}"
  
  has_git=0
  if ps_git_has_repo; then
    # shellcheck disable=SC2034
    has_git=1
  fi
  
  export REPO_ROOT
  return 0
}

load_format() {
  [[ "${format_loaded}" == "1" ]] && return 0

  # shellcheck source=tools/scripts/branding/format.sh
  . "${REPO_ROOT}/tools/scripts/branding/format.sh"

  format_loaded=1
  return 0
}

init_repo_context() {
  set_repo_root
  load_format
  return 0
}

# ----------------------------
# Logging wrappers (prefer format.sh if present)
# ----------------------------
detail() {
  if command -v ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    echo "$*"
  fi
  return 0
}

detail_err() {
  if command -v ps_detail_err >/dev/null 2>&1; then
    ps_detail_err "$*"
  else
    echo "$*" >&2
  fi
  return 0
}

info() {
  if command -v ps_info >/dev/null 2>&1; then
    ps_info "$*"
  else
    echo "$*"
  fi
  return 0
}

warn() {
  if command -v ps_warn >/dev/null 2>&1; then
    ps_warn "$*"
  else
    echo "WARN: $*" >&2
  fi
  return 0
}

error() {
  if command -v ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    echo "ERROR: $*" >&2
  fi
  return 0
}

# die() and fail() are provided by core/error-handler.sh (sourced above)
# fail.sh auto-detects ps_error availability

# ----------------------------
# Preconditions
# ----------------------------
require_cmd() {
  local cmd="${1:?command name required}"
  local hint="${2:-}"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    if [[ -n "${hint}" ]]; then
      die "${cmd} is required but was not found on PATH. ${hint}"
    fi
    die "${cmd} is required but was not found on PATH."
  fi
  return 0
}
