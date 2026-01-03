#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Path Validation Utilities
# ------------------------------------------------------------------------------
# Purpose:
#   Consolidated path validation and security helpers. This is the single
#   source of truth for path security validation across all scripts.
#
# Usage:
#   source "${script_dir}/../../core/path-validation.sh"
#
# Functions:
#   safe_relpath()                 - Check if path is safe (no traversal segments)
#   safe_relpath_no_dotdot()       - Stricter check (forbids any ".." substring)
#   resolve_abs_path()             - Resolve path to absolute using python3/realpath
#   validate_repo_relpath_strict() - Full repo-relative validation with workspace check
#   require_safe_relpath()         - Validation wrapper that exits on failure
#   require_safe_relpath_no_dotdot() - Strict validation wrapper
#   check_under_root()             - Verify resolved path stays under repo root
# ==============================================================================
set -euo pipefail

# Prevent double-sourcing
if [[ -n "${_PS_PATH_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_PS_PATH_SH_LOADED=1

# ==============================================================================
# Core path validation functions
# ==============================================================================

# Safe repo-relative path:
# - not empty
# - not absolute
# - no traversal segments (/../ or ../ or ..\)
# Returns 0 if safe, 1 otherwise.
safe_relpath() {
  local p="${1-}"
  [[ -n "${p}" ]] || return 1
  [[ "${p}" != /* ]] || return 1
  # Reject traversal segments rather than any ".." substring.
  case "${p}" in
    *"/../"*)   return 1 ;;  # Unix-style traversal segment /../ in the middle of a path
    *"/.."*)    return 1 ;;  # Unix-style traversal segment /.. at the end of a path
    *"../"*)    return 1 ;;  # Unix-style traversal segment ../ at the start or middle of a path
    *"\../"*)   return 1 ;;  # Mixed separator segment \../ (defensive pattern for odd combinations)
    *"\\.."*)   return 1 ;;  # Windows-style traversal segment \.. in the middle of a path
    *"..\\"*)   return 1 ;;  # Windows-style traversal segment ..\ at the end of a path
  esac
  return 0
}

# Safe repo-relative path that forbids any ".." substring.
# Stricter than safe_relpath - use when no dots are acceptable.
safe_relpath_no_dotdot() {
  local p="${1-}"
  [[ -n "${p}" ]] || return 1
  [[ "${p}" != /* ]] || return 1
  [[ "${p}" != *".."* ]] || return 1
  return 0
}

# Resolve a path to its absolute form using available tools.
# Tries python3 first (most reliable), then realpath, then readlink.
resolve_abs_path() {
  local target="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "${target}"
import os, sys
target = sys.argv[1]
print(os.path.realpath(target))
PY
    return 0
  fi
  if command -v realpath >/dev/null 2>&1; then
    realpath -m -- "${target}"
    return 0
  fi
  if command -v readlink >/dev/null 2>&1; then
    readlink -f -- "${target}" 2>/dev/null || readlink -- "${target}"
    return 0
  fi
  return 1
}

# ==============================================================================
# Strict workspace-aware validation
# ==============================================================================

# Strict repo-relative path guard for PS init.
# Validates:
#   - Path is not empty
#   - Path doesn't use dangerous patterns (~, ., ./, $, backticks)
#   - Resolved path stays within GITHUB_WORKSPACE
#   - Path doesn't target reserved system directories
# Exits with error if validation fails.
validate_repo_relpath_strict() {
  local input_path="${1-}"
  local resolved=""
  local py_resolve_cmd=""

  if [[ -z "${input_path}" ]]; then
    printf 'ERROR: path must not be empty\n' >&2
    exit 1
  fi
  if [[ "${input_path}" == "~"* || \
    "${input_path}" == "." || \
    "${input_path}" == "./" || \
    "${input_path}" == ./* || \
    "${input_path}" == */./* || \
    "${input_path}" == */. || \
    "${input_path}" == */ || \
    "${input_path}" == *"$"* || \
    "${input_path}" == *"\`"* ]]; then
    printf 'ERROR: path must be a repo-relative safe path (got %q)\n' "${input_path}" >&2
    exit 1
  fi

  py_resolve_cmd="import os"
  py_resolve_cmd+=$'\nws = os.environ["GITHUB_WORKSPACE"]'
  py_resolve_cmd+=$'\ninput_path = os.environ["INPUT_PATH"]'
  py_resolve_cmd+=$'\nprint(os.path.abspath(os.path.join(ws, input_path)))'
  resolved="$(
    INPUT_PATH="${input_path}" python3 -c "${py_resolve_cmd}"
  )"
  if [[ "${resolved}" != "${GITHUB_WORKSPACE}"* ]]; then
    printf 'ERROR: path escapes workspace (got %q)\n' "${input_path}" >&2
    exit 1
  fi
  case "${input_path}" in
    .git|.github|.ps-platform|.git/*|.github/*|.ps-platform/*)
      printf 'ERROR: %s is a reserved system directory\n' "${input_path}" >&2
      exit 1
      ;;
    *)
      ;; # default: nothing to do
  esac
  return 0
}

# Check if a resolved absolute path is under the repo root.
# Args: resolved_path [repo_root]
# Exits with error if path escapes root.
check_under_root() {
  local resolved="${1-}"
  local root="${2:-${GITHUB_WORKSPACE:-$(pwd)}}"
  
  if [[ -z "${resolved}" ]]; then
    printf 'ERROR: path must not be empty\n' >&2
    exit 1
  fi
  
  # Normalize root to ensure trailing slash comparison works
  local root_normalized="${root%/}/"
  local resolved_normalized
  
  # Handle case where resolved is exactly the root
  if [[ "${resolved}" == "${root}" ]]; then
    return 0
  fi
  
  # Check if resolved path starts with root
  if [[ "${resolved}/" != "${root_normalized}"* && "${resolved}" != "${root_normalized}"* ]]; then
    printf 'ERROR: path escapes repository root (got %s)\n' "${resolved}" >&2
    exit 1
  fi
  return 0
}

# ==============================================================================
# Validation wrappers (for use with validation.sh style)
# ==============================================================================

# Validate path is safe repo-relative, exit with error if not.
# Args: name path
require_safe_relpath() {
  local name="$1"
  local path="$2"
  if ! safe_relpath "${path}"; then
    printf 'ERROR: %s must be repo-relative without traversal (got: %s)\n' "${name}" "${path}" >&2
    exit 1
  fi
  return 0
}

# Validate path is safe repo-relative with no ".." anywhere, exit with error if not.
# Args: name path
require_safe_relpath_no_dotdot() {
  local name="$1"
  local path="$2"
  if ! safe_relpath_no_dotdot "${path}"; then
    printf 'ERROR: %s must be repo-relative and traversal-free (got: %s)\n' "${name}" "${path}" >&2
    exit 1
  fi
  return 0
}

# Validate and exit if path is empty, absolute, or contains traversal.
# Alias for require_safe_relpath_no_dotdot for backwards compatibility.
# Args: path label
safe_relpath_or_die() {
  local p="${1:-}"
  local label="${2:-path}"
  if [[ -z "${p}" ]]; then
    printf 'ERROR: %s must not be empty\n' "${label}" >&2
    exit 1
  fi
  if ! safe_relpath_no_dotdot "${p}"; then
    printf 'ERROR: %s must be repo-relative and traversal-free (got: %s)\n' "${label}" "${p}" >&2
    exit 1
  fi
  return 0
}
