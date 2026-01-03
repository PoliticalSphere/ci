#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Script: ps-checkout-platform-verify-integrity.sh
# License: Proprietary
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/actions/ps-bootstrap/ps-checkout-platform/ps-checkout-platform-verify-integrity.sh
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
# Verifies the integrity of a platform checkout:
#   - Confirms directory exists and is a git repository
#   - Validates HEAD SHA matches expected ref (if SHA-like)
#   - Enforces pinned ref requirement when enabled
#   - Ensures working directory is clean
#   - Checks for required platform files
#
# DEPENDENCIES
# -----------------------------------------------------------------------------
# dependencies:
#   internal:
#     - tools/scripts/core/validation.sh
#   external: [bash, git]
#
# ENVIRONMENT (INPUT)
# -----------------------------------------------------------------------------
# env:
#   required:
#     - GITHUB_WORKSPACE: Runner workspace root
#     - PS_PLATFORM_PATH: Validated platform path (repo-relative)
#     - PS_PLATFORM_REF: Validated platform ref
#     - PS_PLATFORM_REQUIRE_PINNED_REF: Whether pinned ref is required (true/false)
#
# ==============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Source dependencies
# -----------------------------------------------------------------------------
# shellcheck source=tools/scripts/core/validation.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/validation.sh"

# -----------------------------------------------------------------------------
# Local helpers
# -----------------------------------------------------------------------------
fail() {
  v_error "$*"
  exit 1
}

# -----------------------------------------------------------------------------
# Verify platform directory exists
# -----------------------------------------------------------------------------
platform_dir="${GITHUB_WORKSPACE}/${PS_PLATFORM_PATH}"
if [[ ! -d "${platform_dir}" ]]; then
  fail "platform checkout path not found: ${platform_dir}"
fi

# -----------------------------------------------------------------------------
# Verify git repository
# -----------------------------------------------------------------------------
if ! git -C "${platform_dir}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "platform checkout is not a git repository: ${platform_dir}"
fi

head_sha="$(git -C "${platform_dir}" rev-parse HEAD)"
printf 'PS.CHECKOUT.PLATFORM: head_sha=%s\n' "${head_sha}"

# -----------------------------------------------------------------------------
# Enforce pinned ref requirement
# -----------------------------------------------------------------------------
if [[ "${PS_PLATFORM_REQUIRE_PINNED_REF}" == "true" ]]; then
  if [[ ! "${PS_PLATFORM_REF}" =~ ^[0-9a-fA-F]{40}$ ]]; then
    fail "platform ref must be a full 40-char commit SHA when" \
      "require_pinned_ref=true (got ${PS_PLATFORM_REF})"
  fi
fi

# -----------------------------------------------------------------------------
# Validate ref matches HEAD (if SHA-like)
# -----------------------------------------------------------------------------
if [[ "${PS_PLATFORM_REF}" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  expected_sha="$(git -C "${platform_dir}" rev-parse "${PS_PLATFORM_REF}^{commit}")"
  if [[ "${head_sha}" != "${expected_sha}" ]]; then
    fail "platform ref mismatch (expected ${expected_sha}, got ${head_sha})"
  fi
fi

# -----------------------------------------------------------------------------
# Verify clean working directory
# -----------------------------------------------------------------------------
if [[ -n "$(git -C "${platform_dir}" status --porcelain)" ]]; then
  v_error "platform checkout is not clean"
  git -C "${platform_dir}" status --porcelain >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# Check for required platform files
# -----------------------------------------------------------------------------
missing="0"
for rel in \
  "tools/scripts/branding/format.sh" \
  "tools/scripts/branding/print-section.sh" \
  "tools/scripts/core/validation.sh" \
  "tools/scripts/workflows/ci/validate-ci/index.js" \
  "configs/ci/policies/validate-ci.yml"; do
  if [[ ! -f "${platform_dir}/${rel}" ]]; then
    v_error "platform missing required file: ${rel}"
    missing="1"
  fi
done

if [[ "${missing}" == "1" ]]; then
  exit 1
fi

printf 'PS.BOOTSTRAP.CHECKOUT_PLATFORM: integrity=ok\n'

return 0
