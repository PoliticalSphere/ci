#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Core Bootstrap
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/core/bootstrap.sh
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
# Single entry point for all scripts. Handles:
#   - Auto-discovery of repository and script roots
#   - Loading all core modules in dependency order
#   - Providing consistent environment across all scripts
#
# USAGE
# -----------------------------------------------------------------------------
# From any script at any directory depth:
#
#   _script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   _find_bootstrap() {
#     local dir="$1"
#     while [[ ! -f "${dir}/core/bootstrap.sh" ]] && [[ "${dir}" != "/" ]]; do
#       dir="${dir%/*}"
#     done
#     echo "${dir}/core/bootstrap.sh"
#   }
#   . "$(_find_bootstrap "${_script_dir}")"
#
# Or with known relative path:
#   . "${script_dir}/../../../core/bootstrap.sh"
#
# EXPORTS
# -----------------------------------------------------------------------------
# Environment variables:
#   - PS_SCRIPTS_ROOT: Root of tools/scripts directory
#   - PS_CORE: Path to core/ directory
#   - PS_REPO_ROOT: Repository root (GITHUB_WORKSPACE in CI)
#   - PS_BRANDING: Path to branding/ directory
#   - PS_BOOTSTRAP_LOADED: Guard flag
#
# Functions (from loaded modules):
#   - fail(), die() - from error-handler.sh
#   - log_info(), log_debug(), log_error(), log_warn() - from logging.sh
#   - emit_env(), emit_output() - from gha-helpers.sh
#   - require_true_false(), require_owner_repo() - from validation.sh
#   - safe_relpath_no_dotdot() - from path-validation.sh
#   - ps_resolve_repo_root() - from path-resolution.sh
#
# ==============================================================================

# Prevent double-sourcing
[[ -n "${PS_BOOTSTRAP_LOADED:-}" ]] && return 0
PS_BOOTSTRAP_LOADED=1

# -----------------------------------------------------------------------------
# Strict mode
# -----------------------------------------------------------------------------
set -euo pipefail

# -----------------------------------------------------------------------------
# Auto-discover paths
# -----------------------------------------------------------------------------
_bootstrap_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PS_CORE="${_bootstrap_dir}"
export PS_SCRIPTS_ROOT="${_bootstrap_dir%/core}"
export PS_BRANDING="${PS_SCRIPTS_ROOT}/branding"

# Repository root: prefer GITHUB_WORKSPACE in CI, otherwise derive from path
if [[ -n "${GITHUB_WORKSPACE:-}" ]]; then
  export PS_REPO_ROOT="${GITHUB_WORKSPACE}"
else
  export PS_REPO_ROOT="${PS_SCRIPTS_ROOT%/tools/scripts}"
fi

# Legacy compatibility exports
export REPO_ROOT="${PS_REPO_ROOT}"

# -----------------------------------------------------------------------------
# Load core modules in dependency order
# -----------------------------------------------------------------------------

# 1. Configuration (log levels, flags)
if [[ -f "${PS_CORE}/config.sh" ]]; then
  # shellcheck source=tools/scripts/core/config.sh
  . "${PS_CORE}/config.sh"
fi

# 2. Logging (depends on config)
if [[ -f "${PS_CORE}/logging.sh" ]]; then
  # shellcheck source=tools/scripts/core/logging.sh
  . "${PS_CORE}/logging.sh"
fi

# 3. Error handling (uses logging if available)
# shellcheck source=tools/scripts/core/error-handler.sh
. "${PS_CORE}/error-handler.sh"

# 4. Path resolution
# shellcheck source=tools/scripts/core/path-resolution.sh
. "${PS_CORE}/path-resolution.sh"

# 5. Validation utilities
# shellcheck source=tools/scripts/core/validation.sh
. "${PS_CORE}/validation.sh"

# 6. Path validation (security)
# shellcheck source=tools/scripts/core/path-validation.sh
. "${PS_CORE}/path-validation.sh"

# 7. GHA helpers (optional, only in CI)
if [[ -n "${GITHUB_ACTIONS:-}" ]] && [[ -f "${PS_CORE}/gha-helpers.sh" ]]; then
  # shellcheck source=tools/scripts/core/gha-helpers.sh
  . "${PS_CORE}/gha-helpers.sh"
fi

# 8. Branding/formatting (optional, best-effort)
if [[ -f "${PS_BRANDING}/format.sh" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${PS_BRANDING}/format.sh" || true
fi

# -----------------------------------------------------------------------------
# Bootstrap complete
# -----------------------------------------------------------------------------
log_debug "PS_BOOTSTRAP: loaded (repo=${PS_REPO_ROOT}, scripts=${PS_SCRIPTS_ROOT})"

return 0
