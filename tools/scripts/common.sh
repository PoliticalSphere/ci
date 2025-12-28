#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Script Common Helpers (Canonical Base)
# ------------------------------------------------------------------------------
# Purpose:
#   Single shared foundation for tools/scripts/** bash scripts.
#
# Provides:
#   - repo_root discovery (git-aware, macOS-safe canonicalisation)
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

REPO_ROOT=""
# shellcheck disable=SC2034
repo_root=""
# shellcheck disable=SC2034
has_git=0
format_loaded=0
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# shellcheck source=tools/scripts/common/retry.sh
. "${script_dir}/common/retry.sh"

_ps_realpath_dir() {
  local d="$1"
  if ( cd "$d" >/dev/null 2>&1 ); then
    ( cd "$d" >/dev/null 2>&1 && pwd -P )
  else
    printf '%s' "$d"
  fi
  return 0
}

set_repo_root() {
  local root=""
  has_git=0

  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ -n "${root}" ]]; then
      # shellcheck disable=SC2034
      has_git=1
    fi
  fi

  [[ -n "${root}" ]] || root="$(pwd)"
  REPO_ROOT="$(_ps_realpath_dir "${root}")"
  # shellcheck disable=SC2034
  repo_root="$REPO_ROOT"  # legacy name kept for compatibility (NOT exported)
  export REPO_ROOT
  return 0
}

load_format() {
  [[ "${format_loaded}" == "1" ]] && return 0

  local format_sh="${REPO_ROOT}/tools/scripts/branding/format.sh"
  if [[ -f "${format_sh}" ]]; then
    # shellcheck source=tools/scripts/branding/format.sh
    . "${format_sh}"
  fi

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

die() {
  error "$*"
  # When this file is sourced, prefer returning an error code instead of
  # terminating the entire process — this makes helpers safer for composed
  # scripts and tests. When executed directly, exit with code 1 as before.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  else
    exit 1
  fi
}

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
