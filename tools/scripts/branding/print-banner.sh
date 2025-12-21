#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Banner Printer
# ------------------------------------------------------------------------------
# Purpose:
#   Print the Political Sphere ASCII banner exactly once per process execution.
#   Safe for use in CI and local hooks.
# ==============================================================================

# Print banner only once per shell/process (prevents log spam).
if [[ "${PS_BANNER_PRINTED:-0}" == "1" ]]; then
  exit 0
fi
export PS_BANNER_PRINTED=1

# Resolve banner path relative to this script to avoid CWD ambiguity.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
format_sh="${script_dir}/format.sh"
# shellcheck source=tools/scripts/branding/format.sh
. "${format_sh}"

default_banner_path="${script_dir}/../../../branding/ps-banner.txt"
banner_path="${PS_BANNER_PATH:-${default_banner_path}}"

if [[ ! -f "${banner_path}" ]]; then
  ps_error "Political Sphere banner not found at: ${banner_path}"
  ps_detail_err "HINT: ensure branding/ps-banner.txt exists and is committed."
  exit 1
fi

if ps_supports_color; then
  C_RESET="\033[0m"
  C_BOLD="\033[1m"
  C_CYAN="\033[36m"
  C_DIM="\033[2m"
  printf "%b" "${C_BOLD}${C_CYAN}"
  cat "${banner_path}"
  printf "%b\n" "${C_RESET}"
  printf "%b%s%b\n" "${C_DIM}" "────────────────────────────────────────" "${C_RESET}"
else
  cat "${banner_path}"
  # Ensure a trailing newline for clean logs.
  echo
fi
