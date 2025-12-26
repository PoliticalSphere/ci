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

platform_root="${PS_PLATFORM_ROOT:-}"
workspace_root="${GITHUB_WORKSPACE:-}"

# Resolve and normalize (strip trailing slash)
if [[ -n "${platform_root}" && -d "${platform_root}" ]]; then
  scripts_root="${platform_root%/}"
  source_origin="PS_PLATFORM_ROOT"
elif [[ -n "${workspace_root}" && -d "${workspace_root}" ]]; then
  scripts_root="${workspace_root%/}"
  source_origin="GITHUB_WORKSPACE"
else
  printf '::error:: Root resolution failed: neither PS_PLATFORM_ROOT nor GITHUB_WORKSPACE is available or valid.\n' >&2
  exit 1
fi

# Contract validation: expected platform tools structure
if [[ ! -d "${scripts_root}/tools/scripts" ]]; then
  printf '::error:: Resolved scripts_root (%s) via %s does not appear to contain the PS platform tools structure.\n' "${scripts_root}" "${source_origin}" >&2
  exit 1
fi

printf 'PS.TOOLS: scripts_root=%s (%s)\n' "${source_origin}" "${scripts_root}"
printf 'PS_SCRIPTS_ROOT=%s\n' "${scripts_root}" >> "${GITHUB_ENV}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'scripts_root=%s\n' "${scripts_root}" >> "${GITHUB_OUTPUT}"
fi
