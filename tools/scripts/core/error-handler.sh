#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Fail Helper
# ------------------------------------------------------------------------------
# Purpose:
#   Provides a standardized fail() function for error handling across all
#   scripts. When sourced, allows the caller to handle errors; when executed
#   directly, exits the process.
#
# Usage:
#   source tools/scripts/core/error-handler.sh
#   fail "something went wrong"
#
# Behavior:
#   - Prints "ERROR: <message>" to stderr
#   - When sourced: returns 1 (caller can catch with || or set +e)
#   - When executed directly: exits with code 1
# ==============================================================================
set -euo pipefail

# Prevent double-sourcing
if [[ -n "${_PS_FAIL_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_PS_FAIL_SH_LOADED=1

fail() {
  # Use ps_error if available (from format.sh), otherwise plain stderr
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    printf 'ERROR: %s\n' "$*" >&2
  fi
  # When sourced, return so the caller can handle the error.
  # When executed directly, exit to stop the process.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  else
    exit 1
  fi
}

# Alias for compatibility with scripts using die()
die() {
  fail "$@"
}
