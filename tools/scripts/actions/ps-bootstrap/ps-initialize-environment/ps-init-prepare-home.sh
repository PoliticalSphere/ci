#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Script: ps-init-prepare-home.sh
# License: Proprietary
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/actions/ps-bootstrap/ps-initialize-environment/ps-init-prepare-home.sh
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
# Prepares and enables HOME/XDG isolation for the job:
#   - Creates isolated HOME directory
#   - Sets HOME, XDG_CACHE_HOME, XDG_CONFIG_HOME, XDG_STATE_HOME
#   - Adds isolated bin directory to PATH
#   - Emits home_abs to GITHUB_OUTPUT
#
# DEPENDENCIES
# -----------------------------------------------------------------------------
# dependencies:
#   internal:
#     - tools/scripts/branding/format.sh
#     - tools/scripts/core/gha-helpers.sh
#   external: [bash]
#
# ENVIRONMENT (INPUT)
# -----------------------------------------------------------------------------
# env:
#   required:
#     - GITHUB_WORKSPACE: Runner workspace root
#     - PS_HOME_DIR_VALIDATED: Validated home directory (repo-relative)
#     - PS_HOME_ORIGINAL: Original HOME value
#     - GITHUB_OUTPUT: GitHub Actions output file
#     - GITHUB_PATH: GitHub Actions path file
#
# ENVIRONMENT (OUTPUT)
# -----------------------------------------------------------------------------
# Emits to GITHUB_ENV:
#   - HOME
#   - HOME_ORIGINAL
#   - XDG_CACHE_HOME
#   - XDG_CONFIG_HOME
#   - XDG_STATE_HOME
#
# Emits to GITHUB_OUTPUT:
#   - home_abs
#
# ==============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Source dependencies
# -----------------------------------------------------------------------------
# shellcheck source=tools/scripts/branding/format.sh
. "${GITHUB_WORKSPACE}/tools/scripts/branding/format.sh" || true

if type -t ps_rule >/dev/null 2>&1; then
  ps_rule
fi

# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/gha-helpers.sh"

# -----------------------------------------------------------------------------
# Create isolated HOME
# -----------------------------------------------------------------------------
home_abs="${GITHUB_WORKSPACE}/${PS_HOME_DIR_VALIDATED}"
mkdir -p "${home_abs}"

# -----------------------------------------------------------------------------
# Apply HOME + XDG dirs (keeps tools isolated/deterministic)
# -----------------------------------------------------------------------------
emit_env "HOME" "${home_abs}"
emit_env "HOME_ORIGINAL" "${PS_HOME_ORIGINAL}"
emit_env "XDG_CACHE_HOME" "${home_abs}/.cache"
emit_env "XDG_CONFIG_HOME" "${home_abs}/.config"
emit_env "XDG_STATE_HOME" "${home_abs}/.state"

# -----------------------------------------------------------------------------
# Create subdirectories and add bin to PATH
# -----------------------------------------------------------------------------
mkdir -p "${home_abs}/bin"
echo "${home_abs}/bin" >> "${GITHUB_PATH}"
mkdir -p "${home_abs}/.cache" "${home_abs}/.config" "${home_abs}/.state"

# -----------------------------------------------------------------------------
# Emit output
# -----------------------------------------------------------------------------
echo "home_abs=${home_abs}" >> "${GITHUB_OUTPUT}"

printf 'PS.INIT: HOME=%s\n' "${home_abs}"

return 0
