#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Output Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared helpers for emitting multiline step outputs safely.
# ==============================================================================

emit_output() {
  local key="$1"
  local value="$2"
  local sanitized delimiter attempts max_attempts
  max_attempts="${MAX_HEREDOC_DELIMITER_ATTEMPTS:-6}"
  sanitized="${value//$'\r'/}"
  delimiter="__PS_OUT_${RANDOM}_${RANDOM}__"
  attempts=0
  while [[ "${sanitized}" == *"${delimiter}"* ]]; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -gt "${max_attempts}" ]]; then
      printf 'ERROR: output value for %s contains an unsafe heredoc delimiter\n' \
        "${key}" >&2
      exit 1
    fi
    delimiter="__PS_OUT_${RANDOM}_${RANDOM}__"
  done
  printf '%s<<%s\n%s\n%s\n' "${key}" "${delimiter}" "${sanitized}" "${delimiter}" \
    >> "${GITHUB_OUTPUT}"
  return 0
}
