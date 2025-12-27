#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Detect Platform Snapshot
# ------------------------------------------------------------------------------
# Purpose:
#   Detect platform snapshots and export roots for bootstrap.
# ==============================================================================


path="${PS_PLATFORM_SNAPSHOT_PATH:-.ps-platform}"

# If a platform snapshot (downloaded artifact) is present, export PS_PLATFORM_ROOT
if [[ -d "${path}" && -f "${path}/tools/scripts/branding/print-section.sh" ]]; then
  printf 'PS_PLATFORM_ROOT=%s\n' "${GITHUB_WORKSPACE}/${path}" >> "${GITHUB_ENV}"
  printf 'PS.PLATFORM: detected platform snapshot, PS_PLATFORM_ROOT set to %s/%s\n' "${GITHUB_WORKSPACE}" "${path}"
else
  printf 'PS.PLATFORM: platform snapshot not found at %s; PS_PLATFORM_ROOT not set\n' "${path}" >&2
fi
# Always expose the repo-relative platform path to callers (helps workflows reference files)
printf 'platform_path=%s\n' "${path}" >> "${GITHUB_OUTPUT}"
