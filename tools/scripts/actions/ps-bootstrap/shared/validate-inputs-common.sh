#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap: Validate Inputs Common
# ==============================================================================
# DEPRECATED: This file now delegates to core/action-input-validator.sh
# All validation functions have moved to that centralized module.
#
# This file is maintained only for backward compatibility during migration.
# DO NOT ADD NEW FUNCTIONS HERE - add them to core/action-input-validator.sh
#
# ==============================================================================

workspace_root="${GITHUB_WORKSPACE:-$(pwd)}"

# Load the centralized action input validator
# shellcheck source=tools/scripts/core/action-input-validator.sh
. "${workspace_root}/tools/scripts/core/action-input-validator.sh"

# BACKWARD COMPATIBILITY: Re-export legacy names mapping to new functions
# These are kept only temporarily to avoid breaking existing scripts

validate_bool() {
  action_validate_bool "$@"
}

validate_enum() {
  action_validate_enum "$@"
}

validate_int_nonneg() {
  action_validate_int_nonneg "$@"
}

validate_positive_int() {
  action_validate_positive_int "$@"
}

validate_repo_path() {
  action_validate_repo_path "$@"
}

validate_working_directory() {
  action_validate_path "working_directory" "${1:-}" "dir"
}

validate_package_lock_required() {
  local wd="${1:-.}"
  local require_lock="${2:-0}"
  
  if [[ "${require_lock}" == "1" ]]; then
    if [[ ! -f "${workspace_root}/${wd}/package.json" ]]; then
      v_error "package.json not found at ${workspace_root}/${wd}/package.json"
      exit 1
    fi
    if [[ ! -f "${workspace_root}/${wd}/package-lock.json" ]]; then
      v_error "package-lock.json not found (npm ci requires a lockfile)"
      exit 1
    fi
  fi
}

validate_fetch_depth_with_full_history() {
  local fetch_depth="${1:?}"
  local require_full_history="${2:?}"
  
  if [[ "${require_full_history}" == "1" && "${fetch_depth}" != "0" ]]; then
    v_error "full history required but fetch_depth=${fetch_depth} (expected 0)"
    exit 1
  fi
}

validate_owner_repo() {
  action_validate_owner_repo "$@"
}

emit_validated_env() {
  gha_set_output "$@"
}


# ==============================================================================
# Working Directory Validation
# ==============================================================================

# validate_working_directory <working_dir_input>
# Validates working directory and returns normalized path
# Returns "." if input is empty
validate_working_directory() {
  local wd="${1:-}"
  
  if [[ -z "${wd}" ]]; then
    wd='.'
  fi
  
  if ! safe_relpath_no_dotdot "${wd}"; then
    v_error "inputs.working_directory must be a repo-relative safe path"
    exit 1
  fi
  
  printf '%s' "${wd}"
}

# ==============================================================================
# Package Manager Validation
# ==============================================================================

# validate_package_lock_required <working_dir> <require_lock>
# Validates package.json and package-lock.json existence if required
# Exits with helpful error message if validation fails
validate_package_lock_required() {
  local wd="$1"
  local require_lock="$2"
  
  if [[ "${require_lock}" == "1" ]]; then
    if [[ ! -f "${workspace_root}/${wd}/package.json" ]]; then
      v_error "package.json not found at ${workspace_root}/${wd}/package.json"
      v_detail "HINT: ensure checkout ran and the package.json exists at the working directory."
      exit 1
    fi
    
    if [[ ! -f "${workspace_root}/${wd}/package-lock.json" ]]; then
      v_error "package-lock.json not found (npm ci requires a lockfile for determinism)."
      v_detail "HINT: commit package-lock.json or set install_dependencies=0 (and handle installs elsewhere)."
      exit 1
    fi
  fi
}

# ==============================================================================
# Fetch Depth and Full History Validation
# ==============================================================================

# validate_fetch_depth_with_full_history <fetch_depth> <require_full_history>
# Validates consistency: if full_history is required, fetch_depth must be 0
# Returns exit code 1 if conflict detected
validate_fetch_depth_with_full_history() {
  local fetch_depth="$1"
  local require_full_history="$2"
  
  if [[ "${require_full_history}" == "1" && "${fetch_depth}" != "0" ]]; then
    v_error "full history required but fetch_depth=${fetch_depth} (expected 0)"
    exit 1
  fi
}

# ==============================================================================
# Repository Format Validation
# ==============================================================================

# validate_owner_repo <input_name> <raw_value>
# Validates OWNER/REPO format
validate_owner_repo() {
  local input_name="$1"
  local raw_value="$2"
  require_owner_repo "${input_name}" "${raw_value}"
}

# ==============================================================================
# Export Common Helper
# ==============================================================================

# emit_validated_env <env_var_name> <value>
# Wrapper for emit_env - use consistent naming
emit_validated_env() {
  local var_name="$1"
  local value="$2"
  emit_env "${var_name}" "${value}"
}
