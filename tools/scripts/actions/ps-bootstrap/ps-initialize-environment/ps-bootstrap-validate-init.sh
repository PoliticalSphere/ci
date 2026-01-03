#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — PS Bootstrap: Validate Init Inputs
# ==============================================================================
# ps_header_v: 6
#
# PURPOSE
# ------------------------------------------------------------------------------
# Normalize and validate all ps-init inputs. Converts 0/1/true/false to
# canonical forms, validates paths are repo-relative, and emits validated
# environment variables for downstream steps.
#
# INPUTS (via environment)
# ------------------------------------------------------------------------------
# PS_FETCH_DEPTH_INPUT          - Git fetch depth
# PS_CHECKOUT_REF_INPUT         - Optional git ref
# PS_REQUIRE_FULL_HISTORY_INPUT - Require fetch_depth=0
# PS_HOME_DIR_INPUT             - Repo-relative HOME directory
# PS_HOME_ISOLATION_INPUT       - Enable HOME/XDG isolation
# PS_PLATFORM_REPO_INPUT        - Platform repository OWNER/REPO
# PS_PLATFORM_REF_INPUT         - Platform ref (branch/tag/SHA)
# PS_PLATFORM_PATH_INPUT        - Repo-relative path for platform checkout
# PS_SKIP_PLATFORM_INPUT        - Skip platform checkout
# PS_PLATFORM_FETCH_DEPTH_INPUT - Platform checkout fetch depth
# PS_PLATFORM_CLEAN_PATH_INPUT  - Delete platform_path before checkout
# PS_PLATFORM_REQUIRE_PINNED_REF_INPUT - Require 40-char SHA
# PS_PLATFORM_ALLOWLIST_INPUT   - Allowed repositories
# PS_INSTALL_TOOLS_INPUT        - Install tool bundles
# PS_TOOLS_BUNDLE_INPUT         - Tools bundle (lint|security|none)
#
# OUTPUTS (via GITHUB_ENV)
# ------------------------------------------------------------------------------
# PS_FETCH_DEPTH_VALIDATED
# PS_REQUIRE_FULL_HISTORY_VALIDATED
# PS_HOME_DIR_VALIDATED
# PS_HOME_ISOLATION_VALIDATED
# PS_HOME_ORIGINAL
# PS_SKIP_PLATFORM_VALIDATED
# PS_PLATFORM_REPO_VALIDATED
# PS_PLATFORM_REF_VALIDATED
# PS_PLATFORM_PATH_VALIDATED
# PS_PLATFORM_FETCH_DEPTH_VALIDATED
# PS_PLATFORM_CLEAN_PATH_VALIDATED
# PS_PLATFORM_REQUIRE_PINNED_REF_VALIDATED
# PS_PLATFORM_ALLOWLIST_VALIDATED
# PS_INSTALL_TOOLS_VALIDATED
# PS_TOOLS_BUNDLE_VALIDATED
#
# ==============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Load cross-cutting utilities
# -----------------------------------------------------------------------------
# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/gha-helpers.sh"
# shellcheck source=tools/scripts/core/validation.sh
# Note: validation.sh now sources core/path-validation.sh automatically
. "${GITHUB_WORKSPACE}/tools/scripts/core/validation.sh"

# -----------------------------------------------------------------------------
# Load branding (optional)
# -----------------------------------------------------------------------------
# shellcheck source=tools/scripts/branding/format.sh
. "${GITHUB_WORKSPACE}/tools/scripts/branding/format.sh" || true
if type -t ps_header >/dev/null 2>&1; then
  ps_header "PS Init: validate inputs"
fi

# -----------------------------------------------------------------------------
# Helper
# -----------------------------------------------------------------------------
fail() {
  v_error "$*"
  exit 1
}

# -----------------------------------------------------------------------------
# Validate python3 dependency
# -----------------------------------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  fail "python3 is required for ps-init path validation"
fi

# -----------------------------------------------------------------------------
# Normalize boolean inputs
# -----------------------------------------------------------------------------
require_full="$(require_bool "require_full_history" "${PS_REQUIRE_FULL_HISTORY_INPUT}")"
skip_platform="$(require_bool "skip_platform_checkout" "${PS_SKIP_PLATFORM_INPUT}")"
clean_platform="$(require_bool "platform_clean_path" "${PS_PLATFORM_CLEAN_PATH_INPUT}")"
require_pinned_ref="$(
  require_bool "platform_require_pinned_ref" "${PS_PLATFORM_REQUIRE_PINNED_REF_INPUT}"
)"
install_tools="$(require_bool "install_tools" "${PS_INSTALL_TOOLS_INPUT}")"
isolate_home="$(require_bool "home_isolation" "${PS_HOME_ISOLATION_INPUT}")"

# -----------------------------------------------------------------------------
# Validate fetch depth
# -----------------------------------------------------------------------------
depth="$(require_int_nonneg "fetch_depth" "${PS_FETCH_DEPTH_INPUT:-1}")"
if [[ "${require_full}" == "1" && "${depth}" != "0" ]]; then
  fail "require_full_history enabled but fetch_depth=${depth} (expected 0)"
fi

# -----------------------------------------------------------------------------
# Validate HOME directory path
# -----------------------------------------------------------------------------
home_rel="${PS_HOME_DIR_INPUT:-.home}"
validate_repo_relpath_strict "${home_rel}"

# -----------------------------------------------------------------------------
# Validate platform inputs
# -----------------------------------------------------------------------------
pdepth="$(require_int_nonneg "platform_fetch_depth" "${PS_PLATFORM_FETCH_DEPTH_INPUT:-1}")"

prepo="${PS_PLATFORM_REPO_INPUT:-}"
pref="${PS_PLATFORM_REF_INPUT:-}"
ppath="${PS_PLATFORM_PATH_INPUT:-.ps-platform}"

if [[ "${skip_platform}" == "0" ]]; then
  if [[ -z "${prepo}" ]]; then
    fail "platform_repo must not be empty when platform checkout is enabled"
  fi
  prepo="$(require_owner_repo "platform_repo" "${prepo}")"
  if [[ -z "${pref}" ]]; then
    fail "platform_ref must not be empty"
  fi
  validate_repo_relpath_strict "${ppath}"
fi

# -----------------------------------------------------------------------------
# Validate tools bundle
# -----------------------------------------------------------------------------
bundle="$(require_enum "tools_bundle" "${PS_TOOLS_BUNDLE_INPUT:-none}" lint security none)"

# -----------------------------------------------------------------------------
# Persist validated values to GITHUB_ENV
# -----------------------------------------------------------------------------
emit_env "PS_FETCH_DEPTH_VALIDATED" "${depth}"
emit_env "PS_REQUIRE_FULL_HISTORY_VALIDATED" "${require_full}"
emit_env "PS_HOME_DIR_VALIDATED" "${home_rel}"
emit_env "PS_HOME_ISOLATION_VALIDATED" "${isolate_home}"
emit_env "PS_HOME_ORIGINAL" "${HOME}"

emit_env "PS_SKIP_PLATFORM_VALIDATED" "${skip_platform}"
emit_env "PS_PLATFORM_REPO_VALIDATED" "${prepo}"
emit_env "PS_PLATFORM_REF_VALIDATED" "${pref}"
emit_env "PS_PLATFORM_PATH_VALIDATED" "${ppath}"
emit_env "PS_PLATFORM_FETCH_DEPTH_VALIDATED" "${pdepth}"
emit_env "PS_PLATFORM_CLEAN_PATH_VALIDATED" "${clean_platform}"
emit_env "PS_PLATFORM_REQUIRE_PINNED_REF_VALIDATED" "${require_pinned_ref}"
emit_env "PS_PLATFORM_ALLOWLIST_VALIDATED" "${PS_PLATFORM_ALLOWLIST_INPUT:-}"

emit_env "PS_INSTALL_TOOLS_VALIDATED" "${install_tools}"
emit_env "PS_TOOLS_BUNDLE_VALIDATED" "${bundle}"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
printf 'PS.INIT: validated (repo depth=%s, platform=%s, tools=%s)\n' \
  "${depth}" \
  "$([[ "${skip_platform}" == "1" ]] && echo "off" || echo "on")" \
  "$([[ "${install_tools}" == "1" ]] && echo "${bundle}" || echo "off")"
return 0
return 0