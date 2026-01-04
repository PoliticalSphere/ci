#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Formatted Lint Common Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared helpers for formatted lint runners.
# ==============================================================================

print_lint_intro() {
  local note="${1:-}"
  local icon="${PS_FMT_ICON:-▶}"
  local rule="${PS_FMT_RULE:-────────────────────────────────────────}"

  if type -t ps_supports_color >/dev/null 2>&1 && ps_supports_color; then
    local c_reset=$'\033[0m'
    local c_bold=$'\033[1m'
    local c_dim=$'\033[90m'
    local c_cyan=$'\033[36m'
    local c_green=$'\033[32m'

    printf "%b%s%b %b%s%b\n" "${c_green}" "${icon}" "${c_reset}" "${c_bold}${c_cyan}" "LINT & TYPE CHECK" "${c_reset}"
    printf "%b%s%b\n" "${c_dim}" "${rule}" "${c_reset}"
  else
    printf '%s %s\n' "${icon}" "LINT & TYPE CHECK"
    printf '%s\n' "${rule}"
  fi

  if [[ -n "${note}" ]]; then
    printf '%s\n' "${note}"
  fi

  return 0
} 

lint_pool_wait_for_slot() {
  local max_workers="${1:?max workers required}"
  local active
  while :; do
    active="$(lint_active_count)"
    if [[ "${active}" -lt "${max_workers}" ]]; then
      return 0
    fi
    lint_wait_one || return 0
  done

  return 0
} 

print_lint_banner() {
  ps_print_banner
  print_lint_intro "Note: To debug specific issues locally, you can run linters individually using commands like npm run lint:biome."

  return 0
} 
