#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Set Platform Root
# ------------------------------------------------------------------------------
# Purpose:
#   Set PS_PLATFORM_ROOT for downstream bootstrap steps.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${script_dir}/../cross-cutting/gha-helpers.sh"

emit_env "PS_PLATFORM_ROOT" "${GITHUB_WORKSPACE}/${PS_PLATFORM_PATH_INPUT}"
# Expose repo-relative platform path as a composite action output for callers
printf 'platform_path=%s\n' "${PS_PLATFORM_PATH_INPUT}" >> "${GITHUB_OUTPUT}"
