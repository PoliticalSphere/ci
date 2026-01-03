#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Script: ps-checkout-platform-validate-inputs.sh
# License: Proprietary
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/actions/ps-bootstrap/ps-checkout-platform/ps-checkout-platform-validate-inputs.sh
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
# Validates and normalizes inputs for ps-checkout-platform action.
# Performs:
#   - Repository format validation (OWNER/REPO)
#   - Allowlist checking for non-PoliticalSphere repositories
#   - Path traversal protection
#   - Boolean normalization
#   - Environment emission for downstream steps
#
# DEPENDENCIES
# -----------------------------------------------------------------------------
# dependencies:
#   internal:
#     - tools/scripts/branding/format.sh
#     - tools/scripts/core/gha-helpers.sh
#     - tools/scripts/core/path-validation.sh
#     - tools/scripts/core/validation.sh
#     - tools/scripts/actions/ps-bootstrap/ps-checkout-platform/ps-checkout-validate-common.sh
#   external: [bash]
#
# ENVIRONMENT (INPUT)
# -----------------------------------------------------------------------------
# env:
#   required:
#     - GITHUB_WORKSPACE: Runner workspace root
#     - PS_REPOSITORY_INPUT: Repository in OWNER/REPO format
#     - PS_REF_INPUT: Git ref (branch, tag, or SHA)
#     - PS_PATH_INPUT: Target checkout path (repo-relative)
#   optional:
#     - PS_FETCH_DEPTH_INPUT: Git fetch depth (default: 1)
#     - PS_PERSIST_CREDENTIALS_INPUT: Persist credentials (default: false)
#     - PS_SUBMODULES_INPUT: Checkout submodules (default: false)
#     - PS_REQUIRE_FULL_HISTORY_INPUT: Require full history (default: false)
#     - PS_CLEAN_PATH_INPUT: Clean path before checkout (default: false)
#     - PS_REQUIRE_PINNED_REF_INPUT: Require pinned ref (default: false)
#     - PS_ALLOWED_REPOSITORIES_INPUT: Allowlist for non-PS repos
#
# ENVIRONMENT (OUTPUT)
# -----------------------------------------------------------------------------
# Emits to GITHUB_ENV:
#   - PS_PLATFORM_REPO_VALIDATED
#   - PS_PLATFORM_REF_VALIDATED
#   - PS_PLATFORM_PATH_VALIDATED
#   - PS_PLATFORM_CLEAN_PATH_VALIDATED
#   - PS_PLATFORM_REQUIRE_PINNED_REF_VALIDATED
#
# ==============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Source dependencies
# -----------------------------------------------------------------------------
# shellcheck source=tools/scripts/branding/format.sh
. "${GITHUB_WORKSPACE}/tools/scripts/branding/format.sh" || true

# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/gha-helpers.sh"
# shellcheck source=tools/scripts/core/path-validation.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/path-validation.sh"
# shellcheck source=tools/scripts/core/validation.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/validation.sh"

# -----------------------------------------------------------------------------
# Local helpers
# -----------------------------------------------------------------------------
fail() {
  v_error "$*"
  exit 1
}

log_info() {
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    printf 'PS.CHECKOUT.PLATFORM: %s\n' "$*"
  fi
}

# -----------------------------------------------------------------------------
# Validate repository
# -----------------------------------------------------------------------------
repo="${PS_REPOSITORY_INPUT:-}"
if [[ -z "${repo}" ]]; then
  fail "inputs.repository is required"
fi
repo="$(require_owner_repo "inputs.repository" "${repo}")"

# -----------------------------------------------------------------------------
# Allowlist validation
# -----------------------------------------------------------------------------
allowlist="${PS_ALLOWED_REPOSITORIES_INPUT:-}"
if [[ -z "${allowlist}" ]]; then
  owner="${repo%%/*}"
  if [[ "${owner}" != "PoliticalSphere" ]]; then
    fail "inputs.repository owner must be PoliticalSphere unless allowlisted (got ${repo})"
  fi
fi

# Optional allowlist guard (high value for internal platform safety)
if [[ -n "${allowlist}" ]]; then
  allowed="0"
  while IFS= read -r line; do
    tool_trim="$(printf '%s' "${line}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [[ -z "${tool_trim}" ]] && continue
    [[ "${tool_trim}" == "#"* ]] && continue
    if [[ "${tool_trim}" == "${repo}" ]]; then
      allowed="1"
      break
    fi
  done <<< "${allowlist}"
  if [[ "${allowed}" != "1" ]]; then
    fail "repository ${repo} not in allowed_repositories allowlist"
  fi
fi

# -----------------------------------------------------------------------------
# Validate ref
# -----------------------------------------------------------------------------
ref="${PS_REF_INPUT:-}"
if [[ -z "${ref}" ]]; then
  fail "inputs.ref must not be empty"
fi

# -----------------------------------------------------------------------------
# Validate path
# -----------------------------------------------------------------------------
path="${PS_PATH_INPUT:-.ps-platform}"
if [[ -z "${path}" ]]; then
  fail "inputs.path must not be empty"
fi
# Path traversal guard (defense-in-depth): forbid absolute or ".." anywhere.
if ! safe_relpath_no_dotdot "${path}"; then
  fail "inputs.path must be a repo-relative safe path (got ${path})"
fi

# -----------------------------------------------------------------------------
# Normalize booleans
# -----------------------------------------------------------------------------
require_pinned="$(require_true_false "inputs.require_pinned_ref" \
  "${PS_REQUIRE_PINNED_REF_INPUT:-false}")"
clean="$(require_true_false "inputs.clean_path" \
  "${PS_CLEAN_PATH_INPUT:-false}")"

# -----------------------------------------------------------------------------
# Run common validation
# -----------------------------------------------------------------------------
ws="${GITHUB_WORKSPACE}"
PS_LOG_PREFIX="PS.CHECKOUT.PLATFORM" \
PS_ENV_PREFIX="PS_PLATFORM" \
  bash "$ws/tools/scripts/actions/ps-bootstrap/ps-checkout-platform/ps-checkout-validate-common.sh"

# -----------------------------------------------------------------------------
# Emit validated environment
# -----------------------------------------------------------------------------
emit_env "PS_PLATFORM_REPO_VALIDATED" "${repo}"
emit_env "PS_PLATFORM_REF_VALIDATED" "${ref}"
emit_env "PS_PLATFORM_PATH_VALIDATED" "${path}"
emit_env "PS_PLATFORM_CLEAN_PATH_VALIDATED" "${clean}"
emit_env "PS_PLATFORM_REQUIRE_PINNED_REF_VALIDATED" "${require_pinned}"

# -----------------------------------------------------------------------------
# Log summary
# -----------------------------------------------------------------------------
log_info "repository=${repo}"
log_info "ref=${ref}"
log_info "path=${path}"
log_info "clean_path=${clean}"
log_info "require_pinned_ref=${require_pinned}"

return 0
