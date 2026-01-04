#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Core Bootstrap
# ==============================================================================
# ps_header_v: 6
#
# INTENT: Single entry point for all scripts. Auto-discovers repository,
# loads all core modules in dependency order, provides consistent environment.
#
# ==============================================================================

# Prevent double-sourcing
[[ -n "${PS_BOOTSTRAP_LOADED:-}" ]] && return 0
PS_BOOTSTRAP_LOADED=1

set -euo pipefail

# Auto-discover paths
_bootstrap_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PS_CORE="${_bootstrap_dir}"
export PS_SCRIPTS_ROOT="${_bootstrap_dir%/core}"
export PS_BRANDING="${PS_SCRIPTS_ROOT}/branding"

# Repository root
if [[ -n "${GITHUB_WORKSPACE:-}" ]]; then
  export PS_REPO_ROOT="${GITHUB_WORKSPACE}"
else
  export PS_REPO_ROOT="${PS_SCRIPTS_ROOT%/tools/scripts}"
fi

export REPO_ROOT="${PS_REPO_ROOT}"

# Load core modules in dependency order

# 1. Configuration
if [[ -f "${PS_CORE}/environment/config.sh" ]]; then
  . "${PS_CORE}/environment/config.sh"
fi

# 2. Logging
if [[ -f "${PS_CORE}/logging/logging.sh" ]]; then
  . "${PS_CORE}/logging/logging.sh"
fi

# 3. Error handling
. "${PS_CORE}/logging/error-handler.sh"

# 4. Path resolution
. "${PS_CORE}/environment/path-resolution.sh"

# 5. Validation utilities
. "${PS_CORE}/validation/validation.sh"

# 6. Path validation
. "${PS_CORE}/validation/path-validation.sh"

# 7. GHA helpers (CI only)
if [[ -n "${GITHUB_ACTIONS:-}" ]] && [[ -f "${PS_CORE}/environment/gha-helpers.sh" ]]; then
  . "${PS_CORE}/environment/gha-helpers.sh"
fi

# 8. Branding/formatting
if [[ -f "${PS_CORE}/branding/format.sh" ]]; then
  . "${PS_CORE}/branding/format.sh" || true
fi

log_debug "PS_BOOTSTRAP: loaded (repo=${PS_REPO_ROOT}, scripts=${PS_SCRIPTS_ROOT})"

return 0
