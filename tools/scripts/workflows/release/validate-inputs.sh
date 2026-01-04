#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Validate Release Inputs
# ------------------------------------------------------------------------------
# Purpose:
#   Validate release version format and required inputs before publish.
# ==============================================================================

format_sh="${PS_PLATFORM_ROOT}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  ps_print_section "release.validate" "Validate release inputs (publish)"
fi

version="${PS_RELEASE_VERSION:-}"
if [[ -z "${version}" ]]; then
  echo "ERROR: release_version is required" >&2
  exit 1
fi
if [[ "${version}" == v* ]]; then
  echo "ERROR: release_version must NOT include a leading 'v' (got: ${version})" >&2
  exit 1
fi

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([\-+][0-9A-Za-z\.-]+)?$ ]]; then
  echo "ERROR: release_version must look like SemVer (got: ${version})" >&2
  exit 1
fi

release_ref="${PS_RELEASE_REF:-}"
if [[ -z "${release_ref}" ]]; then
  echo "ERROR: release_ref is required" >&2
  exit 1
fi

echo "PS.RELEASE_VALIDATE: OK"
