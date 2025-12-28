#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS PR Comment Validate Inputs
# ------------------------------------------------------------------------------
# Purpose:
#   Validate PR comment inputs.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/actions/cross-cutting/resolve-validate-inputs.sh
. "${script_dir}/../../cross-cutting/resolve-validate-inputs.sh"
resolve_validate_inputs \
  "HINT: ensure PS_PLATFORM_ROOT is set to the platform checkout OR vendor scripts into the repo." \
  || exit 1

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
