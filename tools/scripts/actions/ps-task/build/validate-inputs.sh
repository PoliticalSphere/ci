#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Build Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate build action inputs.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/core/error-handler.sh
. "${script_dir}/../../../core/error-handler.sh"

# Required-ish: non-empty strings
[[ -n "${PS_ID:-}" ]] || fail "inputs.id must not be empty"
[[ -n "${PS_TITLE:-}" ]] || fail "inputs.title must not be empty"
[[ -n "${PS_DESC:-}" ]] || fail "inputs.description must not be empty"

# Optional: sanity check ID format (soft guardrail)
if ! [[ "${PS_ID}" =~ ^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$ ]]; then
  printf 'WARN: inputs.id is not kebab-case safe: %s\n' "${PS_ID}" >&2
fi

# UX section header if platform branding exists
format_sh="${GITHUB_WORKSPACE}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  ps_print_section "build.config" "Build configuration"
fi

printf 'PS.BUILD: id=%s\n' "${PS_ID}"
printf 'PS.BUILD: title=%s\n' "${PS_TITLE}"
working_dir="${PS_WD:-${PS_WORKING_DIR:-}}"
printf 'PS.BUILD: working_directory=%s\n' "${working_dir}"
printf 'PS.BUILD: script=%s\n' "${PS_SCRIPT}"
if [[ -n "${PS_ARGS:-}" ]]; then
  printf 'PS.BUILD: args=%s\n' "${PS_ARGS}"
else
  printf 'PS.BUILD: args=<none>\n'
fi
