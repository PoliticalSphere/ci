#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Path Resolution Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Provides standardized path resolution utilities for consistent behavior
#   across all scripts. Handles git repos, symlinks, and fallback scenarios.
#
# Usage:
#   # Method 1: Source after determining script_dir (recommended)
#   script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
#   source "${script_dir}/../../core/path-resolution.sh"
#
#   # Method 2: Use the inline snippet to bootstrap (for top-level scripts)
#   # See ps_resolve_paths() below
#
# Exports:
#   PS_SCRIPT_DIR  - Directory containing the calling script (caller's BASH_SOURCE[1])
#   PS_REPO_ROOT   - Repository root (git-aware, with fallback)
#   ps_resolve_script_dir() - Function to resolve script directory
#   ps_resolve_repo_root()  - Function to resolve repository root
# ==============================================================================
set -euo pipefail

# shellcheck disable=SC2034
_path_resolution_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/core/git.sh
. "${_path_resolution_dir}/git.sh"

# Prevent double-sourcing
if [[ -n "${_PS_PATHS_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_PS_PATHS_SH_LOADED=1

# Resolve the directory of the script that is sourcing this file
# Note: Uses BASH_SOURCE[1] because BASH_SOURCE[0] is this file (paths.sh)
ps_resolve_script_dir() {
  local caller_source="${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}"
  local dir
  dir="$(cd "$(dirname "${caller_source}")" >/dev/null 2>&1 && pwd -P)"
  printf '%s' "${dir}"
  return 0
}

# Resolve repository root using git, with pwd fallback
# Args: [fallback_path] - Path to use if git detection fails (defaults to pwd)
ps_resolve_repo_root() {
  local fallback="${1:-$(pwd)}"
  local root=""

  if ps_git_has_repo; then
    root="$(ps_git_repo_root 2>/dev/null || true)"
  fi

  [[ -n "${root}" ]] || root="${fallback}"
  printf '%s' "$(ps_git_realpath_dir "${root}")"
  return 0
}

# Resolve both script_dir and repo_root in one call
# Sets: PS_SCRIPT_DIR and PS_REPO_ROOT
# For backwards compatibility, also sets lowercase: script_dir and repo_root
ps_resolve_paths() {
  PS_SCRIPT_DIR="$(ps_resolve_script_dir)"
  PS_REPO_ROOT="$(ps_resolve_repo_root)"
  
  # Legacy lowercase exports (for backwards compatibility)
  # shellcheck disable=SC2034
  script_dir="${PS_SCRIPT_DIR}"
  # shellcheck disable=SC2034
  repo_root="${PS_REPO_ROOT}"
  
  export PS_SCRIPT_DIR PS_REPO_ROOT
  return 0
}

# Auto-resolve paths when this file is sourced
ps_resolve_paths
