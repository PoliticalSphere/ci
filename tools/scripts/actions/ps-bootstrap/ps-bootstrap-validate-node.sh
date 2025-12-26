#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Validate Node
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Node.js inputs for bootstrap.
# ==============================================================================


scripts_root="${PS_SCRIPTS_ROOT:?PS_SCRIPTS_ROOT not set}"
workspace_root="${PS_WORKSPACE_ROOT:?PS_WORKSPACE_ROOT not set}"

validate_sh="${scripts_root}/tools/scripts/branding/validate-inputs.sh"
if [[ ! -f "${validate_sh}" ]]; then
  printf 'ERROR: validate-inputs.sh not found at %s\n' "${validate_sh}" >&2
  echo "HINT: ensure PS_PLATFORM_ROOT points at the platform checkout, or vendor scripts into the repo." >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${validate_sh}"

# Validate inputs early
if ! require_number "inputs.node_version" "${PS_NODE_VERSION_INPUT}"; then
  printf "ERROR: inputs.node_version must be a number (major version). Got '%s'.\n" "${PS_NODE_VERSION_INPUT}" >&2
  exit 1
fi
require_enum "inputs.cache" "${PS_CACHE_INPUT}" "1" "0" || exit 1
require_enum "inputs.install_dependencies" "${PS_INSTALL_DEP_INPUT}" "1" "0" || exit 1

# Validate working_directory (repo-relative)
wd="${PS_WORKING_DIR_INPUT:-}"
if [[ -z "${wd}" ]]; then
  wd='.'
fi
if [[ "${wd}" == /* ]]; then
  printf 'ERROR: inputs.working_directory must be repo-relative (must not start with /)\n' >&2
  exit 1
fi
if [[ "${wd}" == *".."* ]]; then
  printf 'ERROR: inputs.working_directory must not contain .. path traversal\n' >&2
  exit 1
fi

if [[ "${PS_INSTALL_DEP_INPUT}" == "1" ]]; then
  if [[ ! -f "${workspace_root}/${wd}/package.json" ]]; then
    printf 'ERROR: package.json not found at %s\n' "${workspace_root}/${wd}/package.json" >&2
    printf 'HINT: ensure checkout ran and the package.json exists at the working directory.\n' >&2
    exit 1
  fi

  if [[ ! -f "${workspace_root}/${wd}/package-lock.json" ]]; then
    printf 'ERROR: package-lock.json not found (npm ci requires a lockfile for determinism).\n' >&2
    printf 'HINT: commit package-lock.json or set install_dependencies=0 (and handle installs elsewhere).\n' >&2
    exit 1
  fi
fi

# Persist validated node version and working dir for downstream steps
printf 'PS_NODE_VERSION_VALIDATED=%s\n' "${PS_NODE_VERSION_INPUT}" >> "${GITHUB_ENV}"
printf 'PS_WORKING_DIRECTORY=%s\n' "${wd}" >> "${GITHUB_ENV}"

printf 'PS.NODE_SETUP: node_version=%q\n' "${PS_NODE_VERSION_INPUT}"
printf 'PS.NODE_SETUP: cache=%q\n' "${PS_CACHE_INPUT}"
printf 'PS.NODE_SETUP: install_dependencies=%q\n' "${PS_INSTALL_DEP_INPUT}"
