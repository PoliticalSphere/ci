#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate ps-bootstrap inputs.
# ==============================================================================


scripts_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE}}"
# shellcheck source=tools/scripts/actions/cross-cutting/validate.sh
. "${scripts_root}/tools/scripts/actions/cross-cutting/validate.sh"
# shellcheck source=tools/scripts/actions/cross-cutting/path.sh
. "${scripts_root}/tools/scripts/actions/cross-cutting/path.sh"

fetch_depth="$(require_int_nonneg "inputs.fetch_depth" "${PS_FETCH_DEPTH_INPUT:-1}")"
egress_lc="$(require_enum "inputs.egress_policy" "${PS_EGRESS_POLICY_INPUT:-audit}" audit block)"
skip_platform="$(require_bool "inputs.skip_platform_checkout" "${PS_SKIP_PLATFORM_CHECKOUT_INPUT:-0}")"

printf '%q\n' "PS.JOB_SETUP: fetch_depth=${fetch_depth}"
printf '%q\n' "PS.JOB_SETUP: egress_policy=${egress_lc}"
if [[ "${skip_platform}" == "1" ]]; then
  printf '%q\n' "PS.JOB_SETUP: skip_platform_checkout=true"
else
  printf '%q\n' "PS.JOB_SETUP: skip_platform_checkout=false"
fi

# Validate working directory (repo-relative, not absolute, no traversal)
wd="${PS_WORKING_DIR_INPUT:-}"
if [[ -z "${wd}" ]]; then
  printf 'ERROR: inputs.working_directory must be non-empty\n' >&2
  exit 1
fi
if ! safe_relpath_no_dotdot "${wd}"; then
  printf 'ERROR: inputs.working_directory must be a repo-relative safe path\n' >&2
  exit 1
fi

# Validate boolean flags
skip_harden="$(require_bool "inputs.skip_harden" "${PS_SKIP_HARDEN_INPUT:-0}")"
require_bool "inputs.skip_checkout" "${PS_SKIP_CHECKOUT_INPUT:-0}" >/dev/null
require_bool "inputs.cache" "${PS_CACHE_INPUT:-1}" >/dev/null
require_bool "inputs.install_dependencies" "${PS_INSTALL_DEP_INPUT:-1}" >/dev/null
install_tools="$(require_bool "inputs.install_tools" "${PS_INSTALL_TOOLS_INPUT:-0}")"
allow_unsafe="$(require_bool "inputs.allow_unsafe" "${PS_ALLOW_UNSAFE_INPUT:-0}")"

printf '%q\n' "PS.JOB_SETUP: skip_harden=${skip_harden}"
printf '%q\n' "PS.JOB_SETUP: allow_unsafe=${allow_unsafe}"

if [[ "${skip_harden}" == "1" ]]; then
  if [[ "${allow_unsafe}" != "1" ]]; then
    printf 'ERROR: skip_harden=1 requires allow_unsafe=1 and an unsafe_reason.\n' >&2
    exit 1
  fi
  if [[ -z "${PS_UNSAFE_REASON_INPUT:-}" ]]; then
    printf 'ERROR: unsafe_reason is required when allow_unsafe=1.\n' >&2
    exit 1
  fi
  printf '%q\n' "PS.JOB_SETUP: unsafe_reason=${PS_UNSAFE_REASON_INPUT:-}"
fi

# Validate tools bundle enum
require_enum "inputs.tools_bundle" "${PS_TOOLS_BUNDLE_INPUT:-none}" lint security none >/dev/null

# If tools are to be installed, ensure platform scripts are available
if [[ "${install_tools}" == "1" ]]; then
  if [[ -z "${PS_PLATFORM_ROOT:-}" || ! -d "${PS_PLATFORM_ROOT}" ]]; then
    printf 'ERROR: PS_PLATFORM_ROOT not set or missing; cannot validate/install tools. Ensure platform checkout is available or skip install_tools.\n' >&2
    exit 1
  fi
  validate_sh="${PS_PLATFORM_ROOT}/tools/scripts/actions/cross-cutting/validate.sh"
  if [[ ! -f "${validate_sh}" ]]; then
    printf 'ERROR: validate.sh not found at %s; cannot validate tools.\n' "${validate_sh}" >&2
    exit 1
  fi
fi

# Persist validated working dir
printf 'PS_WORKING_DIR=%s\n' "${wd}" >> "${GITHUB_ENV}"
