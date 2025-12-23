#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Section Printer
# ------------------------------------------------------------------------------
# Usage:
#   print-section <id> <title> [description]
# Env:
#   PS_SECTION_SPACING=1  Print a blank line before the section (default 1)
# ==============================================================================

id="${1:-}"
title="${2:-}"
description="${3:-}"

if [[ -z "${id}" || -z "${title}" ]]; then
  echo "ERROR: print-section requires <id> and <title>" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/branding/format.sh
. "${script_dir}/format.sh"

# Fallback: when `format.sh` isn't available or doesn't define the helper
# (e.g., invoked in odd environments), provide a minimal `ps_supports_color`
# so the printer won't fail with "command not found".
if ! declare -F ps_supports_color >/dev/null 2>&1; then
  ps_supports_color() {
    # NO_COLOR: any non-empty value except "0" disables
    if [[ -n "${NO_COLOR:-}" && "${NO_COLOR}" != "0" ]]; then
      return 1
    fi

    # TERM=dumb disables
    if [[ -z "${TERM:-}" || "${TERM}" == "dumb" ]]; then
      return 1
    fi

    # FORCE_COLOR enables
    if [[ "${FORCE_COLOR:-0}" != "0" ]]; then
      return 0
    fi

    # TTY enables
    if [[ -t 1 ]]; then
      return 0
    fi

    # CI often supports ANSI escapes in logs
    if [[ "${CI:-0}" != "0" ]]; then
      return 0
    fi

    return 1
  }
fi

ICON="${PS_FMT_ICON:-▶}"
SEPARATOR="${PS_FMT_SEPARATOR:-—}"
DETAIL_INDENT="${PS_FMT_DETAIL_INDENT:-  }"
ID_CASE="${PS_FMT_SECTION_ID_CASE:-upper}"
SPACING="${PS_SECTION_SPACING:-1}"

# ANSI formatting defaults (in case format.sh wasn't present or didn't define them)
PS_FMT_RESET="${PS_FMT_RESET:-$'\033[0m'}"
PS_FMT_DIM="${PS_FMT_DIM:-$'\033[2m'}"
PS_FMT_BOLD="${PS_FMT_BOLD:-$'\033[1m'}"
PS_FMT_CYAN="${PS_FMT_CYAN:-$'\033[36m'}"
PS_FMT_GREEN="${PS_FMT_GREEN:-$'\033[32m'}"
PS_FMT_YELLOW="${PS_FMT_YELLOW:-$'\033[33m'}"
PS_FMT_RED="${PS_FMT_RED:-$'\033[31m'}"
PS_FMT_GRAY="${PS_FMT_GRAY:-$'\033[90m'}"

# Normalise ID for machine readability.
case "${ID_CASE}" in
  upper) section_id="$(tr '[:lower:]' '[:upper:]' <<< "${id}")" ;;
  lower) section_id="$(tr '[:upper:]' '[:lower:]' <<< "${id}")" ;;
  *)     section_id="${id}" ;;
esac

if [[ "${SPACING}" == "1" ]]; then
  printf "\n"
fi

if ps_supports_color; then
  printf "%b%s%b %b%s%b %s %b%s%b\n" \
    "${PS_FMT_GREEN}" "${ICON}" "${PS_FMT_RESET}" \
    "${PS_FMT_BOLD}${PS_FMT_CYAN}" "${section_id}" "${PS_FMT_RESET}" \
    "${SEPARATOR}" "${PS_FMT_BOLD}" "${title}" "${PS_FMT_RESET}"
else
  printf '%s\n' "${ICON} ${section_id} ${SEPARATOR} ${title}"
fi

if [[ -n "${description}" ]]; then
  if ps_supports_color; then
    printf "%b%s%s%b\n" "${PS_FMT_GRAY}" "${DETAIL_INDENT}" "${description}" "${PS_FMT_RESET}"
  else
    printf '%s\n' "${DETAIL_INDENT}${description}"
  fi
fi

# If sourced, return; if executed, exit normally.
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
else
  exit 0
fi
