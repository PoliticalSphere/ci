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

# Structured logging defaults
PS_LOG_SCHEMA="${PS_LOG_SCHEMA:-ps.log.v1}"
PS_LOG_MODE="${PS_LOG_MODE:-both}"
PS_LOG_STREAM="${PS_LOG_STREAM:-stdout}"
PS_LOG_PATH="${PS_LOG_PATH:-}"

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
# Structured logging helpers (logfmt)
# ----------------------------
ps_log_enabled() {
  case "${PS_LOG_MODE:-both}" in
    human|off|false|0) return 1 ;;
    *) return 0 ;;
  esac
}

ps_epoch_ms() {
  local now="" out=""
  if out="$(date -u +%s%3N 2>/dev/null)"; then
    if [[ "${out}" =~ ^[0-9]+$ ]]; then
      printf '%s' "${out}"
      return 0
    fi
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
    return 0
  fi
  now="$(date -u +%s 2>/dev/null || date +%s)"
  printf '%s000' "${now}"
  return 0
}

_ps_log_timestamp() {
  local ts=""
  if [[ -n "${SOURCE_DATE_EPOCH:-}" && "${SOURCE_DATE_EPOCH}" =~ ^[0-9]+$ ]]; then
    if date -u -r "${SOURCE_DATE_EPOCH}" +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then
      ts="$(date -u -r "${SOURCE_DATE_EPOCH}" +%Y-%m-%dT%H:%M:%SZ)"
    else
      ts="$(date -u -d "@${SOURCE_DATE_EPOCH}" +%Y-%m-%dT%H:%M:%SZ)"
    fi
  else
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S)"
  fi
  printf '%s' "${ts}"
  return 0
}

_ps_log_escape() {
  local raw="$1"
  raw="${raw//$'\r'/ }"
  raw="${raw//$'\n'/ }"
  raw="${raw//$'\t'/ }"
  if [[ -z "${raw}" ]]; then
    printf '""'
    return 0
  fi
  if [[ "${raw}" =~ [[:space:]=\"] || "${raw}" == *\\* ]]; then
    raw="${raw//\\/\\\\}"
    raw="${raw//\"/\\\"}"
    printf '"%s"' "${raw}"
    return 0
  fi
  printf '%s' "${raw}"
  return 0
}

ps_log() {
  local level="${1:-info}"
  local event="${2:-log}"
  shift 2 || true
  local message=""

  if [[ $# -gt 0 && "${1}" != *=* ]]; then
    message="$1"
    shift || true
  fi

  ps_log_enabled || return 0

  local line="PS.LOG"
  line+=" schema=$(_ps_log_escape "${PS_LOG_SCHEMA}")"
  line+=" ts=$(_ps_log_escape "$(_ps_log_timestamp)")"
  line+=" level=$(_ps_log_escape "${level}")"
  line+=" event=$(_ps_log_escape "${event}")"

  if [[ -n "${PS_LOG_COMPONENT:-}" ]]; then
    line+=" component=$(_ps_log_escape "${PS_LOG_COMPONENT}")"
  fi

  if [[ -n "${PS_RUN_ID:-}" ]]; then
    line+=" run_id=$(_ps_log_escape "${PS_RUN_ID}")"
  elif [[ -n "${GITHUB_RUN_ID:-}" ]]; then
    line+=" run_id=$(_ps_log_escape "${GITHUB_RUN_ID}")"
  fi

  if [[ -n "${message}" ]]; then
    line+=" message=$(_ps_log_escape "${message}")"
  fi

  local kv key val
  for kv in "$@"; do
    [[ "${kv}" == *=* ]] || continue
    key="${kv%%=*}"
    val="${kv#*=}"
    line+=" ${key}=$(_ps_log_escape "${val}")"
  done

  case "${PS_LOG_MODE:-both}" in
    file) : ;;
    *)
      if [[ "${PS_LOG_STREAM:-stdout}" == "stderr" ]]; then
        printf '%s\n' "${line}" >&2
      else
        printf '%s\n' "${line}"
      fi
      ;;
  esac

  if [[ -n "${PS_LOG_PATH:-}" ]]; then
    mkdir -p "$(dirname "${PS_LOG_PATH}")" 2>/dev/null || true
    printf '%s\n' "${line}" >> "${PS_LOG_PATH}" 2>/dev/null || true
  fi

  return 0
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
  ps_log info detail "$*"
  _ps_print 1 "${PS_FMT_DIM}" "${PS_FMT_RESET}" "${msg}"
  return 0
}

ps_detail_err() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  ps_log warn detail "$*" "stream=stderr"
  _ps_print 2 "${PS_FMT_DIM}" "${PS_FMT_RESET}" "${msg}"
  return 0
}

ps_bullet() {
  ps_log info bullet "$*"
  printf "%s%s %s\n" "${PS_FMT_BULLET_INDENT}" "${PS_FMT_BULLET}" "$*"
  return 0
}

ps_info() {
  ps_log info info "$*"
  _ps_print 1 "" "" "${PS_FMT_ICON} $*"
  return 0
}

ps_header() {
  local msg="${PS_FMT_DETAIL_INDENT}$*"
  ps_log info header "$*"
  ps_rule
  _ps_print 1 "${PS_FMT_BOLD}" "${PS_FMT_RESET}" "${msg}"
  ps_rule
  return 0
}

ps_cli_header() {
  local title="${1:-}"
  local command="${2:-}"
  local repo="${3:-}"
  local work_dir="${4:-${PS_CLI_WORKDIR:-.}}"
  local package_manager="${5:-${PS_CLI_PACKAGE_MANAGER:-npm}}"
  local rule="${PS_CLI_RULE:-${PS_FMT_RULE}}"
  local separator="${PS_FMT_SEPARATOR:-—}"

  if [[ -z "${repo}" ]]; then
    if [[ -n "${repo_root:-}" ]]; then
      repo="${repo_root##*/}"
    elif command -v git >/dev/null 2>&1; then
      repo="$(git rev-parse --show-toplevel 2>/dev/null || true)"
      repo="${repo##*/}"
    else
      repo="$(basename "$(pwd)")"
    fi
  fi

  local node_version=""
  if command -v node >/dev/null 2>&1; then
    node_version="$(node --version 2>/dev/null || true)"
  fi
  if [[ -z "${node_version}" ]]; then
    node_version="unknown"
  fi

  local icon="${PS_FMT_ICON:-▶}"
  if ps_supports_color; then
    local c_reset=$'\033[0m'
    local c_bold=$'\033[1m'
    local c_dim=$'\033[90m'
    local c_cyan=$'\033[36m'
    local c_green=$'\033[32m'
    local header_text=""

    if [[ -n "${title}" && -n "${command}" ]]; then
      header_text="${title} ${separator} ${command}"
    elif [[ -n "${title}" ]]; then
      header_text="${title}"
    else
      header_text="CLI RUN"
    fi

    printf "%b%s%b\n" "${c_dim}" "${rule}" "${c_reset}"
    printf "%b%s%b %b%s%b\n" "${c_green}" "${icon}" "${c_reset}" "${c_bold}${c_cyan}" "${header_text}" "${c_reset}"
    printf "%b%s%b\n" "${c_dim}" "${rule}" "${c_reset}"
  else
    if [[ -n "${title}" && -n "${command}" ]]; then
      printf '%s %s %s %s\n' "${icon}" "${title}" "${separator}" "${command}"
    elif [[ -n "${title}" ]]; then
      printf '%s %s\n' "${icon}" "${title}"
    else
      printf '%s %s\n' "${icon}" "CLI RUN"
    fi
    printf '%s\n' "${rule}"
  fi
  printf '\n'
  if ps_supports_color; then
    local c_reset=$'\033[0m'
    local c_yellow=$'\033[33m'
    printf '› %bRepository%b      : %s\n' "${c_yellow}" "${c_reset}" "${repo}"
    printf '› %bNode.js%b         : %s\n' "${c_yellow}" "${c_reset}" "${node_version}"
    printf '› %bPackage Manager%b : %s\n' "${c_yellow}" "${c_reset}" "${package_manager}"
    printf '› %bWorking Dir%b     : %s\n' "${c_yellow}" "${c_reset}" "${work_dir}"
  else
    printf '› Repository      : %s\n' "${repo}"
    printf '› Node.js         : %s\n' "${node_version}"
    printf '› Package Manager : %s\n' "${package_manager}"
    printf '› Working Dir     : %s\n' "${work_dir}"
  fi
  printf '\n'
  return 0
}

ps_ok() {
  if ps_supports_color; then
    ps_log info ok "$*"
    _ps_print 1 $'\033[1m\033[32m' "${PS_FMT_RESET}" "${PS_FMT_ICON} OK: $*"
  else
    ps_log info ok "$*"
    _ps_print 1 "" "" "${PS_FMT_ICON} OK: $*"
  fi
  return 0
}

ps_warn() {
  if ps_supports_color; then
    ps_log warn warn "$*"
    _ps_print 2 $'\033[1m\033[33m' "${PS_FMT_RESET}" "WARN: $*"
  else
    ps_log warn warn "$*"
    _ps_print 2 "" "" "WARN: $*"
  fi
  return 0
}

ps_error() {
  if ps_supports_color; then
    ps_log error error "$*"
    _ps_print 2 $'\033[1m\033[31m' "${PS_FMT_RESET}" "ERROR: $*"
  else
    ps_log error error "$*"
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
