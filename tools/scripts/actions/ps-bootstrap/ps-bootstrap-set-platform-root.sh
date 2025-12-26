#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Set Platform Root
# ------------------------------------------------------------------------------
# Purpose:
#   Set PS_PLATFORM_ROOT for downstream bootstrap steps.
# ==============================================================================

emit_env() {
  local key="$1"
  local val="$2"
  local sanitized delimiter attempts
  sanitized="${val//$'\r'/}"
  delimiter="__PS_ENV_${RANDOM}_${RANDOM}__"
  attempts=0
  while [[ "${sanitized}" == *"${delimiter}"* ]]; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -gt 6 ]]; then
      printf 'ERROR: env value for %s contains an unsafe heredoc delimiter\n' "${key}" >&2
      exit 1
    fi
    delimiter="__PS_ENV_${RANDOM}_${RANDOM}__"
  done
  printf '%s<<%s\n%s\n%s\n' "${key}" "${delimiter}" "${sanitized}" "${delimiter}" >> "${GITHUB_ENV}"
}

emit_env "PS_PLATFORM_ROOT" "${GITHUB_WORKSPACE}/${PS_PLATFORM_PATH_INPUT}"
# Expose repo-relative platform path as a composite action output for callers
printf 'platform_path=%s\n' "${PS_PLATFORM_PATH_INPUT}" >> "${GITHUB_OUTPUT}"
