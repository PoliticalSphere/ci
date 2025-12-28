#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Safe format.sh loader
# ------------------------------------------------------------------------------
# Purpose:
#   Source branding helpers with optional hash validation.
# ==============================================================================

ps_format_try_load() {
  local format_root="${1:-}"
  local expected_hash="${2:-}"
  local log_prefix="${3:-PS.BRANDING}"
  local format_sh=""
  local py_hash_cmd=""
  local actual_hash=""

  if [[ -z "${format_root}" ]]; then
    return 1
  fi

  format_sh="${format_root}/tools/scripts/branding/format.sh"
  if [[ ! -f "${format_sh}" ]]; then
    return 1
  fi

  if [[ -n "${expected_hash}" ]]; then
    py_hash_cmd="import hashlib, os"
    py_hash_cmd+=$'\npath = os.environ.get("FORMAT_SH")'
    py_hash_cmd+=$'\nprint(hashlib.sha256(open(path, "rb").read()).hexdigest())'
    actual_hash="$(
      FORMAT_SH="${format_sh}" python3 -c "${py_hash_cmd}"
    )"
    if [[ "${actual_hash}" != "${expected_hash}" ]]; then
      printf '%s: branding skipped (format.sh hash mismatch)\n' "${log_prefix}"
      return 1
    fi
  fi

  # shellcheck source=/dev/null
  . "${format_sh}"
  return 0
}
