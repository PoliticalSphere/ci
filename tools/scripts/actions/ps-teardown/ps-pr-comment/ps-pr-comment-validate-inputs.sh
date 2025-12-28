#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS PR Comment Validate Inputs
# ------------------------------------------------------------------------------
# Purpose:
#   Validate PR comment inputs.
# ==============================================================================

scripts_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE}}"
# shellcheck source=tools/scripts/actions/cross-cutting/validate.sh
. "${scripts_root}/tools/scripts/actions/cross-cutting/validate.sh"

require_nonempty "inputs.pr_number" "${PS_PR_NUMBER}" || exit 1
require_number "inputs.pr_number" "${PS_PR_NUMBER}" || exit 1
require_nonempty "inputs.body" "${PS_BODY}" || exit 1
require_nonempty "inputs.github_token" "${PS_TOKEN}" || exit 1
require_command "gh" || exit 1

if [[ -n "${PS_EXPECTED_BASE:-}" ]]; then
  require_regex \
    "inputs.expected_base_sha" \
    "${PS_EXPECTED_BASE}" \
    '^[A-Fa-f0-9]{40}$' \
    "Expected a full-length 40-char commit SHA." || exit 1
fi

if [[ -n "${PS_EXPECTED_HEAD:-}" ]]; then
  require_regex \
    "inputs.expected_head_sha" \
    "${PS_EXPECTED_HEAD}" \
    '^[A-Fa-f0-9]{40}$' \
    "Expected a full-length 40-char commit SHA." || exit 1
fi

printf 'PS.PR_COMMENT: pr_number=%q\n' "$PS_PR_NUMBER"
printf '%s\n' "PS.PR_COMMENT: body_length=${#PS_BODY}"
