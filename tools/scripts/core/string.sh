#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — String Utilities
# ------------------------------------------------------------------------------
# Purpose:
#   Shared string utilities for bash scripts.
#
# Usage:
#   source "${script_dir}/string.sh"
#   trimmed="$(trim "  hello  ")"
# ==============================================================================

# Prevent double-sourcing
if [[ -n "${_PS_STRING_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_PS_STRING_SH_LOADED=1

# Trim leading and trailing whitespace from a string.
# Args: string
# Returns: trimmed string
trim() {
  local s="${1-}"
  # Remove leading whitespace
  s="${s#"${s%%[![:space:]]*}"}"
  # Remove trailing whitespace
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s}"
  return 0
}
