#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Action Input Validation Base
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/core/action-input-validator.sh
#   file_type: script
#   language: bash
#   version: 1.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Unified input validation for composite actions (GitHub Actions).
# Consolidates validation patterns from action-specific implementations
# into a single, reusable abstraction.
#
# This is the SINGLE SOURCE OF TRUTH for action input validation.
# No action should have its own validation logic.
#
# USAGE
# -----------------------------------------------------------------------------
# . "${GITHUB_WORKSPACE}/tools/scripts/core/action-input-validator.sh"
#
# # Validate specific input types
# action_validate_bool "allow_args" "${INPUT_ALLOW_ARGS}"
# action_validate_enum "mode" "${INPUT_MODE}" "debug" "release"
# action_validate_int_nonneg "timeout" "${INPUT_TIMEOUT}"
# action_validate_path "working_dir" "${INPUT_WORKING_DIRECTORY}" "dir"
#
# ==============================================================================
set -euo pipefail

# Prevent double-sourcing
[[ -n "${_PS_ACTION_INPUT_VALIDATOR_LOADED:-}" ]] && return 0
_PS_ACTION_INPUT_VALIDATOR_LOADED=1

# Load base dependencies
_validator_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=tools/scripts/core/validation.sh
. "${_validator_dir}/validation.sh"

# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${_validator_dir}/gha-helpers.sh"

# Load formatting for errors
if [[ -f "${_validator_dir}/../branding/format.sh" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${_validator_dir}/../branding/format.sh" || true
fi

# =============================================================================
# Boolean Validation
# =============================================================================

# action_validate_bool <input_name> <raw_value>
# Normalizes 0/1/true/false to canonical "0" or "1"
# Exits on invalid input
action_validate_bool() {
  local input_name="${1:?input_name required}"
  local raw_value="${2:?raw_value required}"
  require_bool "${input_name}" "${raw_value}"
}

# =============================================================================
# Enum Validation
# =============================================================================

# action_validate_enum <input_name> <raw_value> <allowed_value_1> [...]
# Returns the matched value or exits on invalid input
action_validate_enum() {
  local input_name="${1:?input_name required}"
  local raw_value="${2:?raw_value required}"
  shift 2
  local allowed=("$@")
  require_enum "${input_name}" "${raw_value}" "${allowed[@]}"
}

# =============================================================================
# Numeric Validation
# =============================================================================

# action_validate_int_nonneg <input_name> <raw_value>
# Returns non-negative integer or exits
action_validate_int_nonneg() {
  local input_name="${1:?input_name required}"
  local raw_value="${2:?raw_value required}"
  require_int_nonneg "${input_name}" "${raw_value}"
}

# action_validate_positive_int <input_name> <raw_value>
# Returns positive integer or exits
action_validate_positive_int() {
  local input_name="${1:?input_name required}"
  local raw_value="${2:?raw_value required}"
  require_positive_number "${input_name}" "${raw_value}"
}

# =============================================================================
# Path Validation
# =============================================================================

# action_validate_path <path_name> <path_value> <type>
# Validates a path (file, dir, or any)
# Args:
#   path_name - Display name (for errors)
#   path_value - Path to validate
#   type - "file", "dir", or "any" (default: "any")
action_validate_path() {
  local path_name="${1:?path_name required}"
  local path_value="${2:?path_value required}"
  local path_type="${3:-any}"

  if [[ -z "${path_value}" ]]; then
    v_error "${path_name} is required"
    exit 1
  fi

  case "${path_type}" in
    file)
      if [[ ! -f "${path_value}" ]]; then
        v_error "${path_name} must be a file (got: ${path_value})"
        exit 1
      fi
      ;;
    dir)
      if [[ ! -d "${path_value}" ]]; then
        v_error "${path_name} must be a directory (got: ${path_value})"
        exit 1
      fi
      ;;
    any)
      if [[ ! -e "${path_value}" ]]; then
        v_error "${path_name} does not exist (got: ${path_value})"
        exit 1
      fi
      ;;
    *)
      v_error "Unknown path type: ${path_type}"
      exit 1
      ;;
  esac

  printf '%s\n' "${path_value}"
  return 0
}

# action_validate_repo_path <path_name> <path_value> [strict]
# Validates a repository-relative path
# With 'strict' argument, forbids ".." in path
action_validate_repo_path() {
  local path_name="${1:?path_name required}"
  local path_value="${2:?path_value required}"
  local strict="${3:-}"

  if [[ -z "${path_value}" ]]; then
    v_error "${path_name} is required"
    exit 1
  fi

  if [[ "${strict}" == "strict" ]]; then
    if ! safe_relpath_no_dotdot "${path_value}"; then
      v_error "${path_name} must be a repo-relative safe path (no '..' or absolute paths allowed)"
      exit 1
    fi
  else
    if ! safe_relpath "${path_value}"; then
      v_error "${path_name} must be a repo-relative safe path (no '..' or absolute paths allowed)"
      exit 1
    fi
  fi

  printf '%s\n' "${path_value}"
  return 0
}

# =============================================================================
# String Validation
# =============================================================================

# action_validate_nonempty <input_name> <value>
# Ensure value is not empty
action_validate_nonempty() {
  local input_name="${1:?input_name required}"
  local value="${2:?value required}"
  require_nonempty "${input_name}" "${value}"
}

# action_validate_regex <input_name> <value> <regex> [hint]
# Validate value matches regex
action_validate_regex() {
  local input_name="${1:?input_name required}"
  local value="${2:?value required}"
  local regex="${3:?regex required}"
  local hint="${4:-}"
  require_regex "${input_name}" "${value}" "${regex}" "${hint}"
}

# action_validate_owner_repo <input_name> <value>
# Validate OWNER/REPO format
action_validate_owner_repo() {
  local input_name="${1:?input_name required}"
  local value="${2:?value required}"
  require_owner_repo "${input_name}" "${value}"
}

# =============================================================================
# Command Validation
# =============================================================================

# action_require_command <command_name>
# Ensure command is available on PATH
action_require_command() {
  local cmd="${1:?command_name required}"
  require_command "${cmd}"
}

# =============================================================================
# Batch Validation Helper
# =============================================================================

# action_validate_all
# Helper to validate multiple inputs in one call
# Usage:
#   action_validate_all \
#     bool:allow_args:"${INPUT_ALLOW_ARGS}" \
#     enum:mode:"${INPUT_MODE}":debug:release \
#     path:output:"${INPUT_OUTPUT}":dir
action_validate_all() {
  local spec
  for spec in "$@"; do
    local type="${spec%%:*}"
    local rest="${spec#*:}"
    
    case "${type}" in
      bool)
        local name="${rest%%:*}"
        local value="${rest#*:}"
        action_validate_bool "${name}" "${value}"
        ;;
      enum)
        local name="${rest%%:*}"
        rest="${rest#*:}"
        local value="${rest%%:*}"
        rest="${rest#*:}"
        local -a allowed=()
        IFS=: read -ra allowed <<< "${rest}"
        action_validate_enum "${name}" "${value}" "${allowed[@]}"
        ;;
      path)
        local name="${rest%%:*}"
        rest="${rest#*:}"
        local value="${rest%%:*}"
        rest="${rest#*:}"
        local ptype="${rest:-any}"
        action_validate_path "${name}" "${value}" "${ptype}"
        ;;
      *)
        v_error "Unknown validation type: ${type}"
        exit 1
        ;;
    esac
  done
}

return 0
