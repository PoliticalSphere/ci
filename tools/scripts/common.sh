#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Script Common Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared helpers for scripts that run from tools/scripts/**.
# ==============================================================================

repo_root=""
format_loaded=0

set_repo_root() {
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -z "${repo_root}" ]]; then
    repo_root="$(pwd)"
  fi
}

load_format() {
  if [[ "${format_loaded}" == "1" ]]; then
    return 0
  fi
  local format_sh="${repo_root}/tools/scripts/branding/format.sh"
  if [[ -f "${format_sh}" ]]; then
    # shellcheck source=tools/scripts/branding/format.sh
    . "${format_sh}"
  fi
  format_loaded=1
}

init_repo_context() {
  set_repo_root
  load_format
}

detail() {
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    echo "$*"
  fi
}

detail_err() {
  if type -t ps_detail_err >/dev/null 2>&1; then
    ps_detail_err "$*"
  else
    echo "$*" >&2
  fi
}

error() {
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    echo "ERROR: $*" >&2
  fi
}

# retry_cmd <retries> <sleep_seconds> <command...>
# Rationale: mitigate transient network failures in CI without masking real errors.
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
