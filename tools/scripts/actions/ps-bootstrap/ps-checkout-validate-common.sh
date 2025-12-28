#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Checkout Validate (Common)
# ------------------------------------------------------------------------------
# Purpose:
#   Shared validation for checkout inputs (fetch depth, submodules, credentials).
# ==============================================================================

format_sh="${GITHUB_WORKSPACE}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=/dev/null
  . "${format_sh}"
fi

# shellcheck source=tools/scripts/actions/cross-cutting/env.sh
. "${GITHUB_WORKSPACE}/tools/scripts/actions/cross-cutting/env.sh"
# shellcheck source=tools/scripts/actions/cross-cutting/validate.sh
. "${GITHUB_WORKSPACE}/tools/scripts/actions/cross-cutting/validate.sh"

log_prefix="${PS_LOG_PREFIX:-PS.CHECKOUT}"
env_prefix="${PS_ENV_PREFIX:-PS}"

log_info() {
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    printf '%s: %s\n' "${log_prefix}" "$*"
  fi
}

depth="$(require_int_nonneg "inputs.fetch_depth" "${PS_FETCH_DEPTH_INPUT:-1}")"
req="$(require_true_false "inputs.require_full_history" "${PS_REQUIRE_FULL_HISTORY_INPUT:-false}")"
if [[ "${req}" == "true" && "${depth}" != "0" ]]; then
  printf 'ERROR: full history required but fetch_depth=%s (expected 0)\n' "${depth}" >&2
  exit 1
fi

pc="$(require_true_false "inputs.persist_credentials" "${PS_PERSIST_CREDENTIALS_INPUT:-false}")"

sm="$(require_enum "inputs.submodules" "${PS_SUBMODULES_INPUT:-false}" false true recursive)"

emit_env "${env_prefix}_FETCH_DEPTH_VALIDATED" "${depth}"
emit_env "${env_prefix}_PERSIST_CREDENTIALS_VALIDATED" "${pc}"
emit_env "${env_prefix}_SUBMODULES_VALIDATED" "${sm}"
emit_env "${env_prefix}_REQUIRE_FULL_HISTORY_VALIDATED" "${req}"

ref="${PS_REF_INPUT:-}"
log_info "fetch_depth=${depth}"
log_info "require_full_history=${req}"
log_info "persist_credentials=${pc}"
log_info "submodules=${sm}"
if [[ -n "${ref}" ]]; then
  log_info "ref=${ref}"
else
  log_info "ref=<default>"
fi
