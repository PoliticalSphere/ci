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

ICON="${PS_FMT_ICON:-▶}"
SEPARATOR="${PS_FMT_SEPARATOR:-—}"
DETAIL_INDENT="${PS_FMT_DETAIL_INDENT:-  }"
ID_CASE="${PS_FMT_SECTION_ID_CASE:-upper}"
SPACING="${PS_SECTION_SPACING:-1}"

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
