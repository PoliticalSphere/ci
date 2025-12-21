#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere - Formatting Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared output helpers for consistent CLI formatting across bash scripts.
# ==============================================================================

format_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
format_env="${PS_FORMAT_ENV:-${format_dir}/format.env}"

if [[ -f "${format_env}" ]]; then
  # shellcheck source=/dev/null
  . "${format_env}"
fi

PS_FMT_ICON="${PS_FMT_ICON:-▶}"
PS_FMT_SEPARATOR="${PS_FMT_SEPARATOR:-—}"
PS_FMT_DETAIL_INDENT="${PS_FMT_DETAIL_INDENT:-  }"
PS_FMT_BULLET_INDENT="${PS_FMT_BULLET_INDENT:-  }"
PS_FMT_BULLET="${PS_FMT_BULLET:--}"
PS_FMT_SECTION_ID_CASE="${PS_FMT_SECTION_ID_CASE:-upper}"

ps_supports_color() {
  if [[ "${NO_COLOR:-0}" == "1" ]]; then
    return 1
  fi
  if [[ "${FORCE_COLOR:-0}" != "0" ]]; then
    return 0
  fi
  [[ -t 1 ]]
}

ps_detail() {
  local msg="$*"
  if ps_supports_color; then
    printf "\033[2m%s%s\033[0m\n" "${PS_FMT_DETAIL_INDENT}" "${msg}"
  else
    printf "%s%s\n" "${PS_FMT_DETAIL_INDENT}" "${msg}"
  fi
}

ps_detail_err() {
  local msg="$*"
  if ps_supports_color; then
    printf "\033[2m%s%s\033[0m\n" "${PS_FMT_DETAIL_INDENT}" "${msg}" >&2
  else
    printf "%s%s\n" "${PS_FMT_DETAIL_INDENT}" "${msg}" >&2
  fi
}

ps_bullet() {
  local msg="$*"
  printf "%s%s %s\n" "${PS_FMT_BULLET_INDENT}" "${PS_FMT_BULLET}" "${msg}"
}

ps_error() {
  local msg="$*"
  if ps_supports_color; then
    printf "\033[1m\033[31mERROR:\033[0m %s\n" "${msg}" >&2
  else
    printf "ERROR: %s\n" "${msg}" >&2
  fi
}

ps_warn() {
  local msg="$*"
  if ps_supports_color; then
    printf "\033[1m\033[33mWARN:\033[0m %s\n" "${msg}" >&2
  else
    printf "WARN: %s\n" "${msg}" >&2
  fi
}
