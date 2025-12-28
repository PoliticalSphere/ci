#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Validation Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared input validation helpers for composite actions.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/actions/cross-cutting/normalize.sh
. "${script_dir}/normalize.sh"

format_sh="${script_dir}/../../branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=/dev/null
  . "${format_sh}"
fi

v_error() {
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
    printf 'ERROR: %s must be 0/1/true/false (got %q)\n' "${name}" "${raw}" >&2
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
      printf 'ERROR: %s must be true|false (got %q)\n' "${name}" "${raw}" >&2
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
    printf 'ERROR: %s must be a non-negative integer (got %q)\n' "${name}" "${raw}" >&2
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
  printf 'ERROR: %s must be %s (got %q)\n' \
    "${name}" "$(IFS='|'; echo "${allowed[*]}")" "${raw}" >&2
  exit 1
}

require_regex() {
  local name="$1"
  local value="$2"
  local pattern="$3"
  local hint="${4:-}"
  if [[ ! "${value}" =~ ${pattern} ]]; then
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
    printf 'ERROR: %s must be OWNER/REPO (got %q)\n' "${name}" "${raw}" >&2
    exit 1
  fi
  printf '%s' "${raw}"
  return 0
}
