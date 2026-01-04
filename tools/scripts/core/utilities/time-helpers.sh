#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — DateTime Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Provides standardized date/time utilities for consistent timestamp handling
#   across all scripts. Supports reproducible builds via SOURCE_DATE_EPOCH.
#
# Usage:
#   source "${REPO_ROOT}/tools/scripts/core/time-helpers.sh"
#   start="$(epoch_now)"
#   # ... do work ...
#   end="$(epoch_now)"
#   echo "Duration: $(( end - start )) seconds"
#   echo "Started at: $(epoch_to_iso "$start")"
#
# Functions:
#   epoch_now()       - Current Unix timestamp (respects SOURCE_DATE_EPOCH)
#   epoch_to_iso()    - Convert Unix timestamp to ISO 8601 UTC format
#   now_iso()         - Current time as ISO 8601 UTC string
#   elapsed_seconds() - Calculate elapsed time between two epochs
#
# Reproducible Builds:
#   Set SOURCE_DATE_EPOCH to a fixed timestamp for deterministic builds.
#   See: https://reproducible-builds.org/docs/source-date-epoch/
# ==============================================================================
set -euo pipefail

# Prevent double-sourcing
if [[ -n "${_PS_DATETIME_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_PS_DATETIME_SH_LOADED=1

# Get current Unix epoch timestamp
# Respects SOURCE_DATE_EPOCH for reproducible builds
epoch_now() {
  if [[ -n "${SOURCE_DATE_EPOCH:-}" && "${SOURCE_DATE_EPOCH}" =~ ^[0-9]+$ ]]; then
    printf '%s' "${SOURCE_DATE_EPOCH}"
    return 0
  fi
  date +%s
  return $?
}

# Convert Unix epoch to ISO 8601 UTC format (YYYY-MM-DDTHH:MM:SSZ)
# Args: epoch - Unix timestamp
# Supports both BSD (macOS) and GNU (Linux) date syntax
epoch_to_iso() {
  local epoch="${1:?epoch timestamp required}"
  
  # BSD date (macOS): date -u -r <epoch>
  if date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null; then
    return 0
  fi
  
  # GNU date (Linux): date -u -d @<epoch>
  date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
  return $?
}

# Get current time as ISO 8601 UTC string
now_iso() {
  epoch_to_iso "$(epoch_now)"
  return $?
}

# Calculate elapsed time between two epochs
# Args: start_epoch end_epoch
# Returns: elapsed seconds (integer)
elapsed_seconds() {
  local start="${1:?start epoch required}"
  local end="${2:?end epoch required}"
  printf '%d' $(( end - start ))
  return $?
}

# Format duration in human-readable form (e.g., "1m 23s")
# Args: seconds
format_duration() {
  local seconds="${1:?seconds required}"
  local mins=$(( seconds / 60 ))
  local secs=$(( seconds % 60 ))
  
  if (( mins > 0 )); then
    printf '%dm %ds' "${mins}" "${secs}"
  else
    printf '%ds' "${secs}"
  fi
  return $?
}
