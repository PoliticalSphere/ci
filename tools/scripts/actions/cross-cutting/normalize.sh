#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Normalize Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared normalization helpers for composite actions.
# ==============================================================================

norm_bool() {
  local normalized_value
  normalized_value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized_value}" in
    1|true|yes|y|on)  echo "1" ;;
    0|false|no|n|off|"") echo "0" ;;
    *) return 1 ;;
  esac
}
