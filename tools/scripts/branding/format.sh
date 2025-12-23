#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Formatting Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared output helpers for consistent CLI formatting across bash scripts.
#
# Usage:
#   # shellcheck source=tools/scripts/branding/format.sh
#   . "tools/scripts/branding/format.sh"
#
# Env:
#   NO_COLOR=1        Disable colour output (any non-empty disables)
#   FORCE_COLOR=1     Force colour output (any non-zero enables)
#   PS_FORMAT_ENV=... Override path to format.env
# ==============================================================================

# Prevent double-loading when sourced by multiple scripts.
if [[ "${PS_FORMAT_LOADED:-0}" == "1" ]]; then
  # If this file is sourced, return; if executed, exit. Use explicit check so
  # ShellCheck doesn't warn about unreachable 'return'.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 0
  else
    exit 0
  fi
fi
PS_FORMAT_LOADED="1"

format_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
format_env="${PS_FORMAT_ENV:-${format_dir}/format.env}"

if [[ -f "${format_env}" ]]; then
  # shellcheck source=/dev/null
  . "${format_env}"
fi

# Defaults (overridable)
PS_FMT_ICON="${PS_FMT_ICON:-▶}"
PS_FMT_SEPARATOR="${PS_FMT_SEPARATOR:-—}"
PS_FMT_DETAIL_INDENT="${PS_FMT_DETAIL_INDENT:-  }"
PS_FMT_BULLET_INDENT="${PS_FMT_BULLET_INDENT:-  }"
PS_FMT_BULLET="${PS_FMT_BULLET:--}"
PS_FMT_SECTION_ID_CASE="${PS_FMT_SECTION_ID_CASE:-upper}"

ps_supports_color() {
  # NO_COLOR: treat any non-empty value as "disable"
  if [[ -n "${NO_COLOR:-}" && "${NO_COLOR:-}" != "0" ]]; then
    return 1
  fi
  # FORCE_COLOR: treat any non-zero as "enable"
  if [[ "${FORCE_COLOR:-0}" != "0" ]]; then
    return 0
  fi
  [[ -t 1 ]]
}

# Internal: print to stdout or stderr with optional ANSI style prefix/suffix.
_ps_print() {
  local fd="${1:?fd required}" ; shift
  local prefix="${1:-}" ; shift
  local suffix="${1:-}" ; shift
  local msg="$*"

  if ps_supports_color && [[ -n "${prefix}${suffix}" ]]; then
    if [[ "${fd}" == "2" ]]; then
      printf "%b%s%b\n" "${prefix}" "${msg}" "${suffix}" >&2
    else
      printf "%b%s%b\n" "${prefix}" "${msg}" "${suffix}"
    fi
  else
    if [[ "${fd}" == "2" ]]; then
      printf "%s\n" "${msg}" >&2
    else
      printf "%s\n" "${msg}"
    fi
  fi
}

ps_detail() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  _ps_print 1 $'\033[2m' $'\033[0m' "${msg}"
}

ps_detail_err() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  _ps_print 2 $'\033[2m' $'\033[0m' "${msg}"
}

ps_bullet() {
  printf "%s%s %s\n" "${PS_FMT_BULLET_INDENT}" "${PS_FMT_BULLET}" "$*"
}

ps_info() {
  _ps_print 1 "" "" "${PS_FMT_ICON} $*"
}

ps_ok() {
  if ps_supports_color; then
    _ps_print 1 $'\033[1m\033[32m' $'\033[0m' "${PS_FMT_ICON} OK: $*"
  else
    _ps_print 1 "" "" "${PS_FMT_ICON} OK: $*"
  fi
}

ps_warn() {
  if ps_supports_color; then
    _ps_print 2 $'\033[1m\033[33m' $'\033[0m' "WARN: $*"
  else
    _ps_print 2 "" "" "WARN: $*"
  fi
}

ps_error() {
  if ps_supports_color; then
    _ps_print 2 $'\033[1m\033[31m' $'\033[0m' "ERROR: $*"
  else
    _ps_print 2 "" "" "ERROR: $*"
  fi
}

ps_die() {
  ps_error "$*"
  exit 1
}
