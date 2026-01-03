#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Validate Node
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Node.js inputs for bootstrap.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${script_dir}/../cross-cutting/gha-helpers.sh"
# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${script_dir}/../cross-cutting/gha-helpers.sh"
# shellcheck source=tools/scripts/core/validation.sh
# Note: validation.sh now sources core/path-validation.sh automatically
. "${script_dir}/../../core/validation.sh"
resolve_scripts_root

workspace_root="${PS_WORKSPACE_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"

# Validate inputs early
node_version="$(require_int_nonneg "inputs.node_version" "${PS_NODE_VERSION_INPUT}")"
require_enum "inputs.cache" "${PS_CACHE_INPUT}" "1" "0" >/dev/null
require_enum "inputs.install_dependencies" "${PS_INSTALL_DEP_INPUT}" "1" "0" >/dev/null

# Validate working_directory (repo-relative)
wd="${PS_WORKING_DIR_INPUT:-}"
if [[ -z "${wd}" ]]; then
  wd='.'
fi
if ! safe_relpath_no_dotdot "${wd}"; then
  printf 'ERROR: inputs.working_directory must be a repo-relative safe path\n' >&2
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
emit_env "PS_NODE_VERSION_VALIDATED" "${node_version}"
emit_env "PS_WORKING_DIRECTORY" "${wd}"

printf 'PS.NODE_SETUP: node_version=%q\n' "${node_version}"
printf 'PS.NODE_SETUP: cache=%q\n' "${PS_CACHE_INPUT}"
printf 'PS.NODE_SETUP: install_dependencies=%q\n' "${PS_INSTALL_DEP_INPUT}"
