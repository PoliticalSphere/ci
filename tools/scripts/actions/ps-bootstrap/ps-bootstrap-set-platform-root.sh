#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Set Platform Root
# ------------------------------------------------------------------------------
# Purpose:
#   Set PS_PLATFORM_ROOT for downstream bootstrap steps.
# ==============================================================================


printf 'PS_PLATFORM_ROOT=%s\n' "${GITHUB_WORKSPACE}/${PS_PLATFORM_PATH_INPUT}" >> "${GITHUB_ENV}"
# Expose repo-relative platform path as a composite action output for callers
printf 'platform_path=%s\n' "${PS_PLATFORM_PATH_INPUT}" >> "${GITHUB_OUTPUT}"
