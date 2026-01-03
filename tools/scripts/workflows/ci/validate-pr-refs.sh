#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Validate PR Refs
# ------------------------------------------------------------------------------
# Purpose:
#   Verify that the PR base/head SHAs match the expected values provided
#   by the caller, preventing TOCTOU drift in dependency review.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

if ! command -v gh >/dev/null 2>&1; then
  error "gh CLI is required but not found on PATH"
  exit 1
fi

if [[ -z "${PS_PR_NUMBER:-}" ]]; then
  error "PS_PR_NUMBER is required"
  exit 1
fi
if ! [[ "${PS_PR_NUMBER}" =~ ^[0-9]+$ ]]; then
  error "PS_PR_NUMBER must be numeric"
  exit 1
fi

if [[ -z "${PS_EXPECTED_BASE_SHA:-}" || -z "${PS_EXPECTED_HEAD_SHA:-}" ]]; then
  error "PS_EXPECTED_BASE_SHA and PS_EXPECTED_HEAD_SHA are required"
  exit 1
fi

if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
  error "GITHUB_REPOSITORY is required"
  exit 1
fi

actual_base="$(gh api --jq '.base.sha' "repos/${GITHUB_REPOSITORY}/pulls/${PS_PR_NUMBER}")"
actual_head="$(gh api --jq '.head.sha' "repos/${GITHUB_REPOSITORY}/pulls/${PS_PR_NUMBER}")"

if [[ "${actual_base}" != "${PS_EXPECTED_BASE_SHA}" ]]; then
  error "PR base SHA mismatch for #${PS_PR_NUMBER}."
  detail_err "Expected: ${PS_EXPECTED_BASE_SHA}"
  detail_err "Actual:   ${actual_base}"
  exit 1
fi

if [[ "${actual_head}" != "${PS_EXPECTED_HEAD_SHA}" ]]; then
  error "PR head SHA mismatch for #${PS_PR_NUMBER}."
  detail_err "Expected: ${PS_EXPECTED_HEAD_SHA}"
  detail_err "Actual:   ${actual_head}"
  exit 1
fi

detail "OK: PR refs validated for #${PS_PR_NUMBER}."
