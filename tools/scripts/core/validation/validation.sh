#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Validation Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared input validation helpers for composite actions and scripts.
#   Also provides path validation via the core/path-validation.sh module.
# ==============================================================================

_validation_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

fail_sh="${_validation_script_dir}/fail.sh"
if [[ -f "${fail_sh}" ]]; then
  # shellcheck source=tools/scripts/core/error-handler.sh
  . "${fail_sh}"
fi

format_sh="${_validation_script_dir}/../branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

# Source path validation utilities (provides safe_relpath, require_safe_relpath, etc.)
path_sh="${_validation_script_dir}/path-validation.sh"
if [[ -f "${path_sh}" ]]; then
  # shellcheck source=tools/scripts/core/path-validation.sh
  . "${path_sh}"
fi

norm_bool() {
  local normalized_value
  normalized_value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized_value}" in
    1|true|yes|y|on)  echo "1" ;;
    0|false|no|n|off|"") echo "0" ;;
    *) return 1 ;;
  esac
}

v_error() {
  if type -t fail >/dev/null 2>&1; then
    fail "$*" || true
    return 0
  fi
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
      echo "::error::$*" >&2
    elif [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
      printf '\033[31mERROR:\033[0m %s\n' "$*" >&2
    else
      echo "ERROR: $*" >&2
    fi
  fi
  return 0
}

v_detail() {
  if type -t ps_detail_err >/dev/null 2>&1; then
    ps_detail_err "$*"
  else
    echo "$*" >&2
  fi
  return 0
}

require_bool() {
  local name="$1"
  local raw="$2"
  local normalized=""
  if ! normalized="$(norm_bool "${raw}")"; then
    local quoted
    quoted="$(printf '%q' "${raw}")"
    v_error "${name} must be 0/1/true/false (got ${quoted})"
    exit 1
  fi
  printf '%s' "${normalized}"
  return 0
}

require_nonempty() {
  local name="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    v_error "${name} is required"
    return 1
  fi
  return 0
}

require_true_false() {
  local name="$1"
  local raw="$2"
  case "${raw}" in
    true|false) printf '%s' "${raw}" ;;
    *)
      local quoted
      quoted="$(printf '%q' "${raw}")"
      v_error "${name} must be true|false (got ${quoted})"
      exit 1
      ;;
  esac
  return 0
}

require_number() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[0-9]+$ ]]; then
    v_error "${name} must be numeric"
    return 1
  fi
  return 0
}

require_int_nonneg() {
  local name="$1"
  local raw="$2"
  if ! [[ "${raw}" =~ ^[0-9]+$ ]]; then
    local quoted
    quoted="$(printf '%q' "${raw}")"
    v_error "${name} must be a non-negative integer (got ${quoted})"
    exit 1
  fi
  printf '%s' "${raw}"
  return 0
}

require_positive_number() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -le 0 ]]; then
    v_error "${name} must be a positive integer"
    return 1
  fi
  return 0
}

require_enum() {
  local name="$1"
  local raw="$2"
  shift 2 || true
  local allowed=("$@")
  local item=""
  for item in "${allowed[@]}"; do
    if [[ "${raw}" == "${item}" ]]; then
      printf '%s' "${raw}"
      return 0
    fi
  done
  local quoted
  quoted="$(printf '%q' "${raw}")"
  v_error "${name} must be $(IFS='|'; echo "${allowed[*]}") (got ${quoted})"
  exit 1
}

require_regex() {
  local name="$1"
  local value="$2"
  local hint="${4:-}"
  if [[ ! "${value}" =~ ${3} ]]; then
    v_error "${name} has invalid format"
    if [[ -n "${hint}" ]]; then
      v_detail "${hint}"
    fi
    return 1
  fi
  return 0
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    v_error "${cmd} is required but not found on PATH"
    return 1
  fi
  return 0
}

require_owner_repo() {
  local name="$1"
  local raw="$2"
  if ! [[ "${raw}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    local quoted
    quoted="$(printf '%q' "${raw}")"
    v_error "${name} must be OWNER/REPO (got ${quoted})"
    exit 1
  fi
  printf '%s' "${raw}"
  return 0
}
