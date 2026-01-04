#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — ESLint
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/lint/eslint.sh
#   file_type: script
#   language: bash
#   version: 2.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Run ESLint with the platform config for specialist JS/TS linting.
#
# Modes:
#   - Fast local (pre-commit): staged JS/TS files only
#   - PR mode: affected files only
#   - Full scan: PS_FULL_SCAN=1 (or CI without PR context)
#
# NOTES
# -----------------------------------------------------------------------------
# - Deterministic gates MUST prefer repo-local binaries (node_modules/.bin)
# - We intentionally do NOT fall back to `npx eslint` (non-deterministic)
# - --max-warnings 0 ensures warnings fail the step (gate-quality)
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/lint/eslint.sh
#   bash tools/scripts/runners/lint/eslint.sh --fix
#   PS_FULL_SCAN=1 bash tools/scripts/runners/lint/eslint.sh
#
# ==============================================================================

# -----------------------------------------------------------------------------
# Bootstrap: Load runner abstraction
# -----------------------------------------------------------------------------
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_script_dir}/../../core/runner-base.sh"

# -----------------------------------------------------------------------------
# Runner Configuration
# -----------------------------------------------------------------------------
readonly ESLINT_ID="lint.eslint"
readonly ESLINT_TITLE="ESLINT"
readonly ESLINT_DESC="Specialist linting and TS-aware rules"
readonly ESLINT_CONFIG="configs/lint/eslint.config.mjs"
readonly ESLINT_LOCAL_BIN="node_modules/.bin/eslint"
readonly ESLINT_FILE_PATTERN="*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx"

# -----------------------------------------------------------------------------
# Initialize Runner
# -----------------------------------------------------------------------------
runner_init "${ESLINT_ID}" "${ESLINT_TITLE}" "${ESLINT_DESC}"

# Require configuration
runner_require_config "${ESLINT_CONFIG}" "ESLint config"

# Require tool (local only, no global fallback for determinism)
runner_require_tool "eslint" "${ESLINT_LOCAL_BIN}" "0"

# Parse pass-through arguments (e.g., --fix)
runner_parse_args "$@"

# -----------------------------------------------------------------------------
# Collect Targets
# -----------------------------------------------------------------------------
runner_collect_targets "${ESLINT_FILE_PATTERN}"

# Skip if no targets
if runner_skip_if_no_targets "No staged JS/TS files to check"; then
  exit 0
fi

# -----------------------------------------------------------------------------
# Execute ESLint
# -----------------------------------------------------------------------------
# Build command arguments
declare -a cmd_args=(
  "--config" "${RUNNER_CONFIG}"
  "--max-warnings" "0"
  "--no-error-on-unmatched-pattern"
)

# Add pass-through args if any
if [[ "${#RUNNER_ARGS[@]:-0}" -gt 0 ]]; then
  cmd_args+=("${RUNNER_ARGS[@]}")
fi

# Add targets
if [[ "${RUNNER_MODE}" == "full" ]]; then
  cmd_args+=("${PS_REPO_ROOT}")
else
  # Filter out any empty targets
  for target in "${RUNNER_TARGETS[@]}"; do
    [[ -n "${target}" ]] && cmd_args+=("${target}")
  done
fi

# Execute with flat config enabled
export ESLINT_USE_FLAT_CONFIG=true
runner_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
