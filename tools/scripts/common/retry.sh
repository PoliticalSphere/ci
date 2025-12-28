#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Retry Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared retry helper for transient failures.
# ==============================================================================

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
