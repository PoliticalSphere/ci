#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS PR Comment Resolve Root
# ------------------------------------------------------------------------------
# Purpose:
#   Resolve repository root for PR comment teardown.
# ==============================================================================

# Reuse centralized resolver
# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${GITHUB_WORKSPACE:-$(pwd)}/tools/scripts/core/gha-helpers.sh" || true

if ! resolve_scripts_root; then
  printf '::error:: Failed to resolve scripts root for PR comment.\n' >&2
  exit 1
fi

printf 'PS.PR_COMMENT: scripts_root=%s\n' "${PS_SCRIPTS_ROOT}"
