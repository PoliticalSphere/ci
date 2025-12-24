#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Banner Printer
# ------------------------------------------------------------------------------
# Purpose:
#   Print the Political Sphere ASCII banner once per process execution.
#
# Behaviour:
#   - Missing banner file does NOT fail the gate by default (non-strict).
#   - Set PS_BANNER_STRICT=1 to make missing banner a hard error.
#
# Env:
#   PS_BANNER_PATH=...   Optional override for banner file path
#   PS_BANNER_STRICT=1   Fail if banner file missing
# ==============================================================================

if [[ "${PS_BANNER_PRINTED:-0}" == "1" ]]; then
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 0
  else
    exit 0
  fi
fi
export PS_BANNER_PRINTED=1

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
format_sh="${script_dir}/format.sh"

# Best-effort: load formatting; degrade gracefully if missing.
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

_have_fn() { type -t "$1" >/dev/null 2>&1; }
_warn() { if _have_fn ps_warn; then ps_warn "$*"; else printf 'WARN: %s\n' "$*" >&2; fi; }
_err()  { if _have_fn ps_error; then ps_error "$*"; else printf 'ERROR: %s\n' "$*" >&2; fi; }
_supports_color() {
  if _have_fn ps_supports_color; then ps_supports_color; return $?; fi
  [[ -t 1 && -n "${TERM:-}" && "${TERM}" != "dumb" ]]
}

# Resolve banner path (prefer repo_root if present)
default_banner_path=""
if [[ -n "${repo_root:-}" && -f "${repo_root}/branding/ps-banner.txt" ]]; then
  default_banner_path="${repo_root}/branding/ps-banner.txt"
else
  default_banner_path="${script_dir}/../../../branding/ps-banner.txt"
fi
banner_path="${PS_BANNER_PATH:-${default_banner_path}}"

if [[ ! -f "${banner_path}" ]]; then
  if [[ "${PS_BANNER_STRICT:-0}" == "1" ]]; then
    _err "Political Sphere banner not found at: ${banner_path}"
    _err "HINT: ensure branding/ps-banner.txt exists and is committed."
    exit 1
  fi
  _warn "Banner not found at: ${banner_path} (continuing without banner)"
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 0
  else
    exit 0
  fi
fi

print_banner() {
  local rule="${PS_FMT_RULE:-────────────────────────────────────────}"

  if _supports_color; then
    local c_reset=$'\033[0m'
    local c_bold=$'\033[1m'
    local c_cyan=$'\033[36m'
    local c_dim=$'\033[90m'

    printf "%b" "${c_bold}${c_cyan}"
    cat "${banner_path}"
    printf "%b\n" "${c_reset}"
    printf "%b%s%b\n" "${c_dim}" "${rule}" "${c_reset}"
  else
    cat "${banner_path}"
    printf '\n'
    printf '%s\n' "${rule}"
  fi

  return 0
}

print_banner
