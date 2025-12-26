#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Install Deps
# ------------------------------------------------------------------------------
# Purpose:
#   Install dependencies for bootstrap steps.
# ==============================================================================


target_dir="${PS_WORKSPACE_ROOT}/${PS_WORKING_DIRECTORY}"
if [[ ! -d "${target_dir}" ]]; then
  printf 'ERROR: working directory not found: %s\n' "${target_dir}" >&2
  printf 'HINT: ensure the repository was checked out and inputs.working_directory is correct.\n' >&2
  exit 1
fi

cd "${target_dir}" || { printf 'ERROR: failed to cd into %s\n' "${target_dir}" >&2; exit 1; }
npm ci --no-audit --no-fund
printf 'PS.NODE_SETUP: OK\n'
