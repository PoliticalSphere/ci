#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — ESLint
# ------------------------------------------------------------------------------
# Purpose:
#   Run ESLint with the platform config for specialist JS/TS linting.
#
# Modes:
#   - Default (local): checks staged files only (fast)
#   - CI / full scan: checks the whole repo when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/eslint.sh
#   bash tools/scripts/lint/eslint.sh --fix
#   PS_FULL_SCAN=1 bash tools/scripts/lint/eslint.sh
# ==============================================================================

# Source shared lint helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/configs/lint/eslint.config.mjs"
if [[ ! -f "${config_path}" ]]; then
  ps_error "ESLint config not found at ${config_path}"
  exit 1
fi

ESLINT_BIN=""
ESL_VIA_NPX=0
if [[ -x "${repo_root}/node_modules/.bin/eslint" ]]; then
  ESLINT_BIN="${repo_root}/node_modules/.bin/eslint"
elif command -v eslint >/dev/null 2>&1; then
  ESLINT_BIN="$(command -v eslint)"
elif command -v npx >/dev/null 2>&1; then
  ESLINT_BIN="$(command -v npx)"
  ESL_VIA_NPX=1
  ps_detail "eslint not found locally — will attempt to run via npx (consider running: npm ci)"
else
  ps_error "eslint is required but not found (run: npm ci)"
  exit 1
fi

# Pass-through args safely (e.g. --fix).
ESLINT_ARGS=()
if [[ "$#" -gt 0 ]]; then
  ESLINT_ARGS+=("$@")
fi

# Build targets
if [[ "${full_scan}" == "1" ]]; then
  targets=("${repo_root}")
else
  collect_targets_staged "*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "ESLint: no staged JS/TS files to check."
    exit 0
  fi
fi

# Enforce "no lint issues" (warnings are issues). Keep behaviour consistent.
run_eslint() {
  local out
  set +e
  if [[ "${#ESLINT_ARGS[@]}" -gt 0 ]]; then
    if [[ "${ESL_VIA_NPX}" -eq 1 ]]; then
      out="$(${ESLINT_BIN} --yes eslint --config "${config_path}" --max-warnings 0 --no-error-on-unmatched-pattern "${ESLINT_ARGS[@]}" "${targets[@]}" 2>&1)"
    else
      out="$(${ESLINT_BIN} --config "${config_path}" --max-warnings 0 --no-error-on-unmatched-pattern "${ESLINT_ARGS[@]}" "${targets[@]}" 2>&1)"
    fi
  else
    if [[ "${ESL_VIA_NPX}" -eq 1 ]]; then
      out="$(${ESLINT_BIN} --yes eslint --config "${config_path}" --max-warnings 0 --no-error-on-unmatched-pattern "${targets[@]}" 2>&1)"
    else
      out="$(${ESLINT_BIN} --config "${config_path}" --max-warnings 0 --no-error-on-unmatched-pattern "${targets[@]}" 2>&1)"
    fi
  fi
  local rc=$?
  set -e

  if [[ ${rc} -ne 0 ]]; then
    # Detect missing plugin/module errors and provide actionable guidance
    if printf '%s' "$out" | grep -Ei "Cannot find package 'eslint-plugin-[^']+" >/dev/null 2>&1 || printf '%s' "$out" | grep -Ei "ERR_MODULE_NOT_FOUND: Cannot find package 'eslint-plugin-[^']+" >/dev/null 2>&1; then
      ps_error "ESLint failed to resolve a plugin required by ${config_path}."
      ps_error "Possible causes: you haven't installed devDependencies, or your npm registry requires auth."
      ps_detail "ESLint output:\n$out"
      ps_error "Run: npm ci  (or: npm install --save-dev <missing-package>) and retry."
      return ${rc}
    fi

    # Otherwise, print output and return the original code
    printf '%s\n' "$out"
    return ${rc}
  fi

  # Print output (if any) and return success
  if [[ -n "$out" ]]; then
    printf '%s\n' "$out"
  fi
  return 0
}

run_eslint
