#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Formatted Lint Runner (Affected files)
# ------------------------------------------------------------------------------
# Purpose:
#   Run the full set of linters against affected files using the same
#   gate-formatted UI as the pre-commit gate. This delegates per-linter
#   target selection to the existing `affected.sh` helper.
#
# Usage:
#   bash tools/scripts/runners/lint/formatted-affected.sh [--fix]
# ==============================================================================

_formatted_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${_formatted_script_dir}/../../gates/gate-common.sh"
# shellcheck source=tools/scripts/runners/lint/formatted-common.sh
. "${_formatted_script_dir}/formatted-common.sh"

GATE_NAME="Lint (affected)"
export GATE_NAME

# Print the lint table during the run and update it inline.
PS_LINT_PRINT_MODE="inline"
export PS_LINT_PRINT_MODE
PS_LINT_INLINE=1
export PS_LINT_INLINE
PS_LINT_SECTION_HEADERS=0
export PS_LINT_SECTION_HEADERS
PS_LINT_STEP_LINES=0
export PS_LINT_STEP_LINES

# Keep local output clean; write structured logs to file unless overridden.
if [[ "${CI:-0}" == "0" ]]; then
  export PS_LOG_MODE="${PS_LOG_MODE:-file}"
  export PS_LOG_PATH="${PS_LOG_PATH:-${LINT_DIR}/ps.log}"
fi
export PS_LOG_MODE="human"

FIX=0
if [[ "${1:-}" == "--fix" ]]; then
  FIX=1
fi

fix_arg=()
if [[ "${FIX}" -eq 1 ]]; then
  fix_arg=(--fix)
fi

# Banner
PS_BANNER_RULE=0 ps_print_banner
ps_cli_header "LINT CHECK" "npm run lint:affected"
gate_log_start

set +e

# Tier 1 (heavy): start first, async.
run_lint_step_async "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" eslint "${fix_arg[@]}"

run_lint_step_async "lint.knip" "KNIP" "Dependency audit (knip)" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" knip

# Tier 2 (light): worker pool (4 light workers + 2 heavy workers).
MAX_LINT_WORKERS=6

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.biome" "BIOME" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" biome "${fix_arg[@]}"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" shellcheck

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.yamllint" "YAMLLINT" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" yaml

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.actionlint" "ACTIONLINT" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" actionlint

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.hadolint" "HADOLINT" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" hadolint

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.markdown" "MARKDOWN" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" markdown "${fix_arg[@]}"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.cspell" "CSPELL" "Spelling checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" cspell

lint_wait_all
set -e

# Typecheck: we don't run typecheck against affected files by default here — keep
# output consistent with pre-commit gate but it may be skipped in some workflows.
for idx in "${!LINT_IDS[@]}"; do
  if [[ "${LINT_IDS[idx]}" == "lint.typecheck" && "${LINT_STATUSES[idx]}" == "Waiting" ]]; then
    LINT_STATUSES[idx]="SKIPPED"
  fi
done

lint_print_tally || true

if [[ "${LINT_FAILED:-0}" -ne 0 ]]; then
  ps_print_section \
    "gate.failed" \
    "${GATE_NAME} failed" \
    "One or more lint checks failed (see logs/lint/*.log)"
  gate_log_finish "FAIL" 1
  exit 1
fi

print_success

exit 0
