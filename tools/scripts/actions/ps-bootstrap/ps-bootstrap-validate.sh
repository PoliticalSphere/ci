#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate ps-bootstrap inputs.
# ==============================================================================


# Normalize and validate basic inputs
if ! printf '%s' "${PS_FETCH_DEPTH_INPUT:-}" | grep -Eq '^[0-9]+$'; then
  printf 'ERROR: fetch_depth must be a non-negative integer. Got: %s\n' "${PS_FETCH_DEPTH_INPUT:-}" >&2
  exit 1
fi

egress_lc="$(printf '%s' "${PS_EGRESS_POLICY_INPUT:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ "${egress_lc}" != "audit" && "${egress_lc}" != "block" ]]; then
  printf 'ERROR: egress_policy must be one of audit|block. Got: %s\n' "${PS_EGRESS_POLICY_INPUT:-}" >&2
  exit 1
fi

skip_norm=$(printf '%s' "${PS_SKIP_PLATFORM_CHECKOUT_INPUT:-}" | tr '[:upper:]' '[:lower:]' | xargs)
if [[ "${skip_norm}" == "1" || "${skip_norm}" == "true" || "${skip_norm}" == "yes" ]]; then
  SKIP_PLATFORM=1
else
  SKIP_PLATFORM=0
fi

printf '%q\n' "PS.JOB_SETUP: fetch_depth=${PS_FETCH_DEPTH_INPUT}"
printf '%q\n' "PS.JOB_SETUP: egress_policy=${egress_lc}"
if [[ "${SKIP_PLATFORM}" -eq 1 ]]; then
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
if [[ "${wd}" == /* ]]; then
  printf 'ERROR: inputs.working_directory must be repo-relative (must not start with /)\n' >&2
  exit 1
fi
if [[ "${wd}" == *".."* ]]; then
  printf 'ERROR: inputs.working_directory must not contain .. path traversal\n' >&2
  exit 1
fi

# Validate boolean flags
if ! printf '%s' "${PS_SKIP_HARDEN_INPUT:-}" | grep -Eq '^(0|1)$'; then
  printf 'ERROR: inputs.skip_harden must be 0 or 1. Got: %s\n' "${PS_SKIP_HARDEN_INPUT:-}" >&2
  exit 1
fi
if ! printf '%s' "${PS_SKIP_CHECKOUT_INPUT:-}" | grep -Eq '^(0|1)$'; then
  printf 'ERROR: inputs.skip_checkout must be 0 or 1. Got: %s\n' "${PS_SKIP_CHECKOUT_INPUT:-}" >&2
  exit 1
fi
if ! printf '%s' "${PS_CACHE_INPUT:-}" | grep -Eq '^(0|1)$'; then
  printf 'ERROR: inputs.cache must be 0 or 1. Got: %s\n' "${PS_CACHE_INPUT:-}" >&2
  exit 1
fi
if ! printf '%s' "${PS_INSTALL_DEP_INPUT:-}" | grep -Eq '^(0|1)$'; then
  printf 'ERROR: inputs.install_dependencies must be 0 or 1. Got: %s\n' "${PS_INSTALL_DEP_INPUT:-}" >&2
  exit 1
fi
if ! printf '%s' "${PS_INSTALL_TOOLS_INPUT:-}" | grep -Eq '^(0|1)$'; then
  printf 'ERROR: inputs.install_tools must be 0 or 1. Got: %s\n' "${PS_INSTALL_TOOLS_INPUT:-}" >&2
  exit 1
fi
if ! printf '%s' "${PS_ALLOW_UNSAFE_INPUT:-}" | grep -Eq '^(0|1)$'; then
  printf 'ERROR: inputs.allow_unsafe must be 0 or 1. Got: %s\n' "${PS_ALLOW_UNSAFE_INPUT:-}" >&2
  exit 1
fi

skip_harden="${PS_SKIP_HARDEN_INPUT:-0}"
allow_unsafe="${PS_ALLOW_UNSAFE_INPUT:-0}"

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
if ! printf '%s' "${PS_TOOLS_BUNDLE_INPUT:-}" | grep -Eq '^(lint|security|none)$'; then
  printf 'ERROR: inputs.tools_bundle must be one of lint|security|none. Got: %s\n' "${PS_TOOLS_BUNDLE_INPUT:-}" >&2
  exit 1
fi

# If tools are to be installed, ensure platform scripts are available
if [[ "${PS_INSTALL_TOOLS_INPUT}" == "1" ]]; then
  if [[ -z "${PS_PLATFORM_ROOT:-}" || ! -d "${PS_PLATFORM_ROOT}" ]]; then
    printf 'ERROR: PS_PLATFORM_ROOT not set or missing; cannot validate/install tools. Ensure platform checkout is available or skip install_tools.\n' >&2
    exit 1
  fi
  validate_sh="${PS_PLATFORM_ROOT}/tools/scripts/branding/validate-inputs.sh"
  if [[ ! -f "${validate_sh}" ]]; then
    printf 'ERROR: validate-inputs.sh not found at %s; cannot validate tools.\n' "${validate_sh}" >&2
    exit 1
  fi
fi

# Persist validated working dir
printf 'PS_WORKING_DIR=%s\n' "${wd}" >> "${GITHUB_ENV}"
