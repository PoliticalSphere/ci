#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Script: ps-init-emit-outputs.sh
# License: Proprietary
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/actions/ps-bootstrap/ps-initialize-environment/ps-init-emit-outputs.sh
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
# Emits final outputs for the ps-initialize-environment action:
#   - repo_root
#   - home_dir
#   - home_original
#   - home_isolation_enabled
#   - platform_root
#   - platform_enabled
#   - init_metadata (JSON)
#
# DEPENDENCIES
# -----------------------------------------------------------------------------
# dependencies:
#   internal: []
#   external: [bash, date]
#
# ENVIRONMENT (INPUT)
# -----------------------------------------------------------------------------
# env:
#   required:
#     - GITHUB_WORKSPACE: Runner workspace root
#     - GITHUB_OUTPUT: GitHub Actions output file
#     - PS_HOME_ISOLATION_VALIDATED: Whether HOME isolation was enabled (0/1)
#     - PS_SKIP_PLATFORM_VALIDATED: Whether platform was skipped (0/1)
#   optional:
#     - PS_HOME_ABS: Absolute HOME path (from ps_home step)
#     - PS_HOME_ORIGINAL: Original HOME value
#     - PS_PLATFORM_ROOT: Platform root path
#
# ENVIRONMENT (OUTPUT)
# -----------------------------------------------------------------------------
# Emits to GITHUB_OUTPUT:
#   - repo_root
#   - home_dir
#   - home_original
#   - home_isolation_enabled
#   - platform_root
#   - platform_enabled
#   - init_metadata
#
# ==============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Resolve values
# -----------------------------------------------------------------------------
repo_root="${GITHUB_WORKSPACE}"
platform_root="${PS_PLATFORM_ROOT:-}"
platform_enabled="false"
home_dir=""
home_isolation_enabled="false"
home_original="${PS_HOME_ORIGINAL:-}"

if [[ "${PS_HOME_ISOLATION_VALIDATED}" == "1" ]]; then
  home_dir="${PS_HOME_ABS}"
  home_isolation_enabled="true"
else
  home_dir="${home_original}"
fi

if [[ "${PS_SKIP_PLATFORM_VALIDATED}" == "0" ]]; then
  platform_enabled="true"
fi

# -----------------------------------------------------------------------------
# Emit outputs
# -----------------------------------------------------------------------------
{
  echo "repo_root=${repo_root}"
  echo "home_dir=${home_dir}"
  echo "home_original=${home_original}"
  echo "home_isolation_enabled=${home_isolation_enabled}"
  echo "platform_root=${platform_root}"
  echo "platform_enabled=${platform_enabled}"
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  format='{"repo_root":"%s","home_dir":"%s","is_isolated":%s,'
  format+='"platform_enabled":%s,"timestamp":"%s"}'
  init_metadata="$(printf "${format}" \
    "${repo_root}" \
    "${home_dir}" \
    "${home_isolation_enabled}" \
    "${platform_enabled}" \
    "${timestamp}")"
  echo "init_metadata=${init_metadata}"
} >> "${GITHUB_OUTPUT}"

# -----------------------------------------------------------------------------
# Log summary
# -----------------------------------------------------------------------------
printf 'PS.BOOTSTRAP.INIT: repo_root=%s\n' "${repo_root}"
printf 'PS.BOOTSTRAP.INIT: home_isolation=%s\n' "${home_isolation_enabled}"
printf 'PS.BOOTSTRAP.INIT: platform_enabled=%s\n' "${platform_enabled}"
printf 'PS.BOOTSTRAP.INIT: platform_root=%s\n' "${platform_root}"
printf 'PS.BOOTSTRAP.INIT: OK\n'

exit 0
