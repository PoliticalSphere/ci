#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — TypeScript Typecheck
# ------------------------------------------------------------------------------
# Purpose:
#   Run strict TypeScript checks using the platform project tsconfig.
#
# Notes:
#   - Typecheck is a "heavy" gate: run in pre-push and CI (not pre-commit).
#   - This script must check an explicit project config (not just a base).
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

branding_script="${repo_root}/tools/scripts/branding/print-section.sh"
project_tsconfig="${repo_root}/tsconfig.json"
if [[ ! -f "${project_tsconfig}" ]]; then
  error "project tsconfig not found at ${project_tsconfig}"
  detail_err "HINT: create tsconfig.json that extends configs/lint/tsconfig.base.json and defines include/files."
  exit 1
fi

TSC_BIN=""
if [[ -x "${repo_root}/node_modules/.bin/tsc" ]]; then
  TSC_BIN="${repo_root}/node_modules/.bin/tsc"
elif command -v tsc >/dev/null 2>&1; then
  TSC_BIN="$(command -v tsc)"
else
  error "tsc is required but not found (run: npm ci)"
  exit 1
fi

# Pass-through args safely (rare, but keeps tooling consistent).
TSC_ARGS=()
if [[ "$#" -gt 0 ]]; then
  TSC_ARGS+=("$@")
fi

if [[ -x "${branding_script}" ]]; then
  bash "${branding_script}" "typecheck" "Typecheck" "tsconfig.json"
else
  echo "Typecheck: tsconfig.json"
fi

# Fail on any diagnostic; keep output stable for CI parsing.
# Be robust on older shells where an empty array can trigger 'unbound variable'.
"${TSC_BIN}" --project "${project_tsconfig}" --pretty false ${TSC_ARGS[@]+"${TSC_ARGS[@]}"}

detail "Typecheck: OK"
