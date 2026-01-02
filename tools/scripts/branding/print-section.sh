#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Section Printer
# ------------------------------------------------------------------------------
# Usage:
#   print-section <id> <title> [description]
# ==============================================================================

id="${1:-}"
title="${2:-}"
description="${3:-}"

if [[ -z "${id}" || -z "${title}" ]]; then
  echo "ERROR: print-section requires <id> and <title>" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
format_sh="${script_dir}/format.sh"
# shellcheck source=tools/scripts/branding/format.sh
. "${format_sh}"

ICON="${PS_FMT_ICON:-▶}"
SEPARATOR="${PS_FMT_SEPARATOR:-—}"
DETAIL_INDENT="${PS_FMT_DETAIL_INDENT:-  }"
ID_CASE="${PS_FMT_SECTION_ID_CASE:-upper}"
RULE="${PS_FMT_RULE:-}"

# Normalise ID for machine readability.
case "${ID_CASE}" in
  upper) section_id="$(tr '[:lower:]' '[:upper:]' <<< "${id}")" ;;
  lower) section_id="$(tr '[:upper:]' '[:lower:]' <<< "${id}")" ;;
  *)     section_id="${id}" ;;
esac

if type -t ps_log >/dev/null 2>&1; then
  if [[ -n "${description}" ]]; then
    ps_log info section "id=${id}" "title=${title}" "detail=${description}"
  else
    ps_log info section "id=${id}" "title=${title}"
  fi
fi

echo
if ps_supports_color; then
  C_RESET="\033[0m"
  C_BOLD="\033[1m"
  C_DIM="\033[90m"
  C_CYAN="\033[36m"
  C_GREEN="\033[32m"

  printf "%b%s%b %b%s%b %s %b%s%b\n" \
    "${C_GREEN}" "${ICON}" "${C_RESET}" \
    "${C_BOLD}${C_CYAN}" "${section_id}" "${C_RESET}" \
    "${SEPARATOR}" "${C_BOLD}" "${title}" "${C_RESET}"

  if [[ -n "${RULE}" ]]; then
    printf "%b%s%b\n" "${C_DIM}" "${RULE}" "${C_RESET}"
  fi
else
  printf '%s\n' "${ICON} ${section_id} ${SEPARATOR} ${title}"
  if [[ -n "${RULE}" ]]; then
    printf '%s\n' "${RULE}"
  fi
fi

if [[ -n "${description}" ]]; then
  if ps_supports_color; then
    printf "%b%s%s%b\n" "${C_DIM}" "${DETAIL_INDENT}" "${description}" "${C_RESET}"
  else
    printf '%s\n' "${DETAIL_INDENT}${description}"
  fi
fi

if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
else
  exit 0
fi
