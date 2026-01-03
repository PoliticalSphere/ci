#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Resolve Tools Scripts Root
# ------------------------------------------------------------------------------
# Purpose:
#   Resolve PS_SCRIPTS_ROOT for ps-tools using PS_PLATFORM_ROOT or GITHUB_WORKSPACE.
#
# Outputs:
#   PS_SCRIPTS_ROOT (exported via GITHUB_ENV)
# ------------------------------------------------------------------------------
# Dependencies:
#   - PS_PLATFORM_ROOT or GITHUB_WORKSPACE
#   - tools/scripts (directory structure marker)
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-tools/action.yml
# ==============================================================================

# Reuse centralized resolver
# shellcheck source=tools/scripts/actions/cross-cutting/gha-helpers.sh
. "${GITHUB_WORKSPACE:-$(pwd)}/tools/scripts/actions/cross-cutting/gha-helpers.sh" || true

# Delegate to the centralized resolver and preserve compatibility
if ! resolve_scripts_root; then
  printf '::error:: Resolved scripts_root failed.\n' >&2
  exit 1
fi
# Optionally print the resolved root for diagnostics
printf 'PS.TOOLS: scripts_root=%s\n' "${PS_SCRIPTS_ROOT}"
