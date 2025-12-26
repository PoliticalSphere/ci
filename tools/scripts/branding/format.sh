#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Formatting Helpers (Single Source of Truth)
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
#
# UI:
#   PS_FMT_WIDTH=40               Shared rule width
#   PS_FMT_RULE_CHAR=─            Character for rules
# ==============================================================================

# Prevent double-loading when sourced by multiple scripts.
if [[ "${PS_FORMAT_LOADED:-0}" == "1" ]]; then
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

# ----------------------------
# Defaults (overridable)
# ----------------------------
PS_FMT_ICON="${PS_FMT_ICON:-▶}"
PS_FMT_SEPARATOR="${PS_FMT_SEPARATOR:-—}"
PS_FMT_DETAIL_INDENT="${PS_FMT_DETAIL_INDENT:-  }"
PS_FMT_BULLET_INDENT="${PS_FMT_BULLET_INDENT:-  }"
PS_FMT_BULLET="${PS_FMT_BULLET:--}"
PS_FMT_SECTION_ID_CASE="${PS_FMT_SECTION_ID_CASE:-upper}"

# UI layout
PS_FMT_WIDTH="${PS_FMT_WIDTH:-40}"
PS_FMT_RULE_CHAR="${PS_FMT_RULE_CHAR:-─}"

# ANSI formatting codes (overridable)
PS_FMT_RESET="${PS_FMT_RESET:-$'\033[0m'}"
PS_FMT_DIM="${PS_FMT_DIM:-$'\033[2m'}"
PS_FMT_BOLD="${PS_FMT_BOLD:-$'\033[1m'}"

# Build the shared rule line exactly once
PS_FMT_RULE="${PS_FMT_RULE:-}"
if [[ -z "${PS_FMT_RULE}" ]]; then
  PS_FMT_RULE=""
  for ((i = 0; i < PS_FMT_WIDTH; i++)); do
    PS_FMT_RULE+="${PS_FMT_RULE_CHAR}"
  done
fi

# ----------------------------
# Capability: colour support
# ----------------------------
ps_supports_color() {
  # NO_COLOR: treat any non-empty value as "disable"
  if [[ -n "${NO_COLOR:-}" && "${NO_COLOR:-}" != "0" ]]; then
    return 1
  fi
  # FORCE_COLOR: treat any non-zero as "enable"
  if [[ "${FORCE_COLOR:-0}" != "0" ]]; then
    return 0
  fi
  # COLORTERM: common modern color indicator
  if [[ "${COLORTERM:-}" == "truecolor" || "${COLORTERM:-}" == "24bit" ]]; then
    return 0
  fi
  [[ -t 1 && -n "${TERM:-}" && "${TERM}" != "dumb" ]] && return 0 || return 1
}

# ----------------------------
# Internal printer
# ----------------------------
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
  return 0
}

# ----------------------------
# Public helpers
# ----------------------------
ps_rule() {
  printf "%s\n" "${PS_FMT_RULE}"
  return 0
}

ps_detail() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  _ps_print 1 "${PS_FMT_DIM}" "${PS_FMT_RESET}" "${msg}"
  return 0
}

ps_detail_err() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  _ps_print 2 "${PS_FMT_DIM}" "${PS_FMT_RESET}" "${msg}"
  return 0
}

ps_bullet() {
  printf "%s%s %s\n" "${PS_FMT_BULLET_INDENT}" "${PS_FMT_BULLET}" "$*"
  return 0
}

ps_info() {
  _ps_print 1 "" "" "${PS_FMT_ICON} $*"
  return 0
}

ps_header() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  ps_rule
  _ps_print 1 "${PS_FMT_BOLD}" "${PS_FMT_RESET}" "${msg}"
  ps_rule
  return 0
}

ps_ok() {
  if ps_supports_color; then
    _ps_print 1 $'\033[1m\033[32m' "${PS_FMT_RESET}" "${PS_FMT_ICON} OK: $*"
  else
    _ps_print 1 "" "" "${PS_FMT_ICON} OK: $*"
  fi
  return 0
}

ps_warn() {
  if ps_supports_color; then
    _ps_print 2 $'\033[1m\033[33m' "${PS_FMT_RESET}" "WARN: $*"
  else
    _ps_print 2 "" "" "WARN: $*"
  fi
  return 0
}

ps_error() {
  if ps_supports_color; then
    _ps_print 2 $'\033[1m\033[31m' "${PS_FMT_RESET}" "ERROR: $*"
  else
    _ps_print 2 "" "" "ERROR: $*"
  fi
  return 0
}

ps_die() {
  local loc=""
  if [[ -n "${BASH_SOURCE[1]:-}" && -n "${BASH_LINENO[0]:-}" ]]; then
    loc=" (${BASH_SOURCE[1]}:${BASH_LINENO[0]})"
  fi
  ps_error "$*${loc}"
  exit 1
}
