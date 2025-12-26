#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Build Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate build action inputs.
# ==============================================================================


fail() { echo "ERROR: $*" >&2; exit 1; }

# Required-ish: non-empty strings
[[ -n "${PS_ID:-}" ]] || fail "inputs.id must not be empty"
[[ -n "${PS_TITLE:-}" ]] || fail "inputs.title must not be empty"
[[ -n "${PS_DESC:-}" ]] || fail "inputs.description must not be empty"

# Optional: sanity check ID format (soft guardrail)
if ! [[ "${PS_ID}" =~ ^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$ ]]; then
  printf 'WARN: inputs.id is not kebab-case safe: %s\n' "${PS_ID}" >&2
fi

# UX section header if platform branding exists
section_sh="${GITHUB_WORKSPACE}/tools/scripts/branding/print-section.sh"
if [[ -f "${section_sh}" ]]; then
  bash "${section_sh}" "build.config" "Build configuration"
fi

printf 'PS.BUILD: id=%s\n' "${PS_ID}"
printf 'PS.BUILD: title=%s\n' "${PS_TITLE}"
printf 'PS.BUILD: working-directory=%s\n' "${PS_WD}"
printf 'PS.BUILD: script=%s\n' "${PS_SCRIPT}"
if [[ -n "${PS_ARGS:-}" ]]; then
  printf 'PS.BUILD: args=%s\n' "${PS_ARGS}"
else
  printf 'PS.BUILD: args=<none>\n'
fi
