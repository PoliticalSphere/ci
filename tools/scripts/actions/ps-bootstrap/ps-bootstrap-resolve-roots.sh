#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Resolve Roots
# ------------------------------------------------------------------------------
# Purpose:
#   Resolve workspace and platform roots for bootstrap.
# ==============================================================================


# Reuse centralized resolver
# shellcheck source=tools/scripts/actions/cross-cutting/gha-helpers.sh
. "${GITHUB_WORKSPACE:-$(pwd)}/tools/scripts/actions/cross-cutting/gha-helpers.sh" || true

if ! resolve_scripts_root; then
  printf 'ERROR: failed to resolve scripts root\n' >&2
  exit 1
fi

# Preserve PS_WORKSPACE_ROOT compatibility
workspace_root="${PS_WORKSPACE_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"
printf 'PS_WORKSPACE_ROOT=%s\n' "${workspace_root}" >> "${GITHUB_ENV}"
