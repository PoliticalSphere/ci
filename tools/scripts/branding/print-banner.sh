#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Banner Printer
# ------------------------------------------------------------------------------
# Purpose:
#   Print the Political Sphere ASCII banner exactly once per process execution.
#   Safe for CI and local hooks.
#
# Env:
#   PS_BANNER_PATH=... Optional override for banner file path
# ==============================================================================

# Print banner only once per shell/process (prevents log spam).
if [[ "${PS_BANNER_PRINTED:-0}" == "1" ]]; then
  # If this file is sourced, return; if executed, exit. Use explicit check so
  # ShellCheck doesn't warn about unreachable 'return'.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 0
  else
    exit 0
  fi
fi
export PS_BANNER_PRINTED=1

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
format_sh="${script_dir}/format.sh"

if [[ ! -f "${format_sh}" ]]; then
  printf 'ERROR: %s\n' "format.sh not found at: ${format_sh}" >&2
  printf '%s\n' "HINT: ensure tools/scripts/branding/format.sh exists and is committed." >&2
  exit 1
fi

# shellcheck source=tools/scripts/branding/format.sh
. "${format_sh}"

default_banner_path="${script_dir}/../../../branding/ps-banner.txt"
banner_path="${PS_BANNER_PATH:-${default_banner_path}}"

if [[ ! -f "${banner_path}" ]]; then
  ps_error "Political Sphere banner not found at: ${banner_path}"
  ps_detail_err "HINT: ensure branding/ps-banner.txt exists and is committed."
  exit 1
fi

print_banner() {
  if ps_supports_color; then
    local c_reset=$'\033[0m'
    local c_bold=$'\033[1m'
    local c_cyan=$'\033[36m'
    local c_dim=$'\033[90m'
    local sep="────────────────────────────────────────"

    printf "%b" "${c_bold}${c_cyan}"
    cat "${banner_path}"
    printf "%b\n" "${c_reset}"
    printf "%b%s%b\n" "${c_dim}" "${sep}" "${c_reset}"
  else
    cat "${banner_path}"
    echo
  fi

  return 0
}

print_banner
