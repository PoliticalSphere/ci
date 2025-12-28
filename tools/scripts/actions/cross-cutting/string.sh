#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — String Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared string utilities for action scripts.
# ==============================================================================

trim() {
  local s="${1-}"
  # Remove leading and trailing whitespace.
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s}"
}
