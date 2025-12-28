#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Install Deps
# ------------------------------------------------------------------------------
# Purpose:
#   Install dependencies for bootstrap steps.
# ==============================================================================

workspace_root="${PS_WORKSPACE_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"
working_dir="${PS_WORKING_DIRECTORY:-${PS_WORKING_DIR_INPUT:-.}}"
target_dir="${workspace_root}/${working_dir}"
if [[ ! -d "${target_dir}" ]]; then
  printf 'ERROR: working directory not found: %s\n' "${target_dir}" >&2
  printf 'HINT: ensure the repository was checked out and inputs.working_directory is correct.\n' >&2
  exit 1
fi

cd "${target_dir}" || { printf 'ERROR: failed to cd into %s\n' "${target_dir}" >&2; exit 1; }
npm ci --no-audit --no-fund
printf 'PS.NODE_SETUP: OK\n'
