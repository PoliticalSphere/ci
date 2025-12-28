#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Resolve Validate Inputs
# ------------------------------------------------------------------------------
# Purpose:
#   Resolve PS scripts root and source the shared validate-inputs helpers.
# ==============================================================================

resolve_scripts_root() {
  workspace_root="${PS_WORKSPACE_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"
  platform_root="${PS_PLATFORM_ROOT:-}"
  if [[ -n "${PS_SCRIPTS_ROOT:-}" ]]; then
    scripts_root="${PS_SCRIPTS_ROOT}"
  elif [[ -n "${platform_root}" && -d "${platform_root}" ]]; then
    scripts_root="${platform_root}"
  else
    scripts_root="${workspace_root}"
  fi
  return 0
}

resolve_validate_inputs() {
  local hint="${1:-}"
  resolve_scripts_root

  validate_sh="${scripts_root}/tools/scripts/actions/cross-cutting/validate.sh"
  if [[ ! -f "${validate_sh}" ]]; then
    printf 'ERROR: validate.sh not found at %s\n' "${validate_sh}" >&2
    if [[ -n "${hint}" ]]; then
      printf '%s\n' "${hint}" >&2
    fi
    return 1
  fi

  # shellcheck source=/dev/null
  . "${validate_sh}"
  return 0
}
