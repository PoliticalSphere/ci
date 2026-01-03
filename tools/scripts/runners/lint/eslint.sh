#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — ESLint (Deterministic, Fast, Gate-Safe)
# ------------------------------------------------------------------------------
# Purpose:
#   Run ESLint with the platform config for specialist JS/TS linting.
#
# Modes:
#   - Default (local): staged files only (fast)
#   - CI / full scan: whole repo when PS_FULL_SCAN=1 or CI=1
#
# Notes:
#   - Deterministic gates MUST prefer repo-local binaries (node_modules/.bin).
#   - We intentionally do NOT fall back to `npx eslint` (non-deterministic).
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/runners/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag
PS_LOG_COMPONENT="lint.eslint"
lint_log_init "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" "$(lint_log_mode)"

if [[ -z "${repo_root:-}" ]]; then
  repo_root="$(pwd)"
fi

config_path="${repo_root}/configs/lint/eslint.config.mjs"
if [[ ! -f "${config_path}" ]]; then
  lint_log_set_status "ERROR"
  ps_error "ESLint config not found: ${config_path}"
  exit 1
fi

ESLINT_BIN="${repo_root}/node_modules/.bin/eslint"
if [[ ! -x "${ESLINT_BIN}" ]]; then
  lint_log_set_status "ERROR"
  ps_error "ESLint not found at ${ESLINT_BIN}"
  ps_detail "Fix: npm ci"
  exit 1
fi

# Pass-through args safely (e.g. --fix), skipping empty args.
ESLINT_ARGS=()
for arg in "$@"; do
  [[ -n "${arg}" ]] && ESLINT_ARGS+=("${arg}")
done

# Determine targets
targets=()
if [[ "${full_scan}" == "1" ]]; then
  targets=("${repo_root}")
else
  collect_targets_staged "*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    lint_log_set_targets 0
    lint_log_set_status "SKIPPED"
    ps_detail "ESLint: no staged JS/TS files to check."
    exit 0
  fi
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  lint_log_set_targets 0
  lint_log_set_status "SKIPPED"
  ps_detail "ESLint: no targets to check."
  exit 0
fi

# Guard against empty target entries (ESLint rejects empty patterns).
filtered_targets=()
for target in "${targets[@]}"; do
  [[ -n "${target}" ]] && filtered_targets+=("${target}")
done
targets=("${filtered_targets[@]}")

if [[ "${#targets[@]}" -eq 0 ]]; then
  lint_log_set_targets 0
  lint_log_set_status "SKIPPED"
  ps_detail "ESLint: no targets to check."
  exit 0
fi
lint_log_set_targets "${#targets[@]}"

# Run ESLint:
# - --max-warnings 0 means warnings fail the step (gate-quality)
# - --no-error-on-unmatched-pattern keeps staged targeting stable
# - stream output (no giant command substitution)
eslint_cmd=(
  "${ESLINT_BIN}"
  --config "${config_path}"
  --max-warnings 0
  --no-error-on-unmatched-pattern
)
if [[ "${#ESLINT_ARGS[@]}" -gt 0 ]]; then
  eslint_cmd+=("${ESLINT_ARGS[@]}")
fi
eslint_cmd+=("${targets[@]}")

set +e
ESLINT_USE_FLAT_CONFIG=true "${eslint_cmd[@]}"
rc=$?
set -e

if [[ "${rc}" -ne 0 ]]; then
  lint_log_set_status "FAIL"
  # Provide actionable guidance for common "missing plugin" / dependency issues.
  # (ESLint prints these to stderr; we already streamed output.)
  ps_error "ESLint failed (exit ${rc})."
  ps_detail "If this is a dependency issue: run npm ci and retry."
  exit "${rc}"
fi

exit 0
