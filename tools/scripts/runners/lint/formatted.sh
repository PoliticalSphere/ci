#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Formatted Lint Runner (Full scan)
# ------------------------------------------------------------------------------
# Purpose:
#   Run the full set of linters using the gate-formatted UI to match the
#   pre-commit gate output. This is intended for local "lint the whole repo"
#   use and will set PS_FULL_SCAN=1 so individual lint scripts perform a
#   repository-wide scan (excluding ignores).
#
# Usage:
#   bash tools/scripts/runners/lint/formatted.sh [--fix]
# ==============================================================================

_formatted_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# Gate helpers provide the run_lint_step + formatted summary
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${_formatted_script_dir}/../../gates/gate-common.sh"
# shellcheck source=tools/scripts/runners/lint/formatted-common.sh
. "${_formatted_script_dir}/formatted-common.sh"

GATE_NAME="Lint"
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

# Ensure full-scan behaviour
export PS_FULL_SCAN=1

# Handle --fix forwarding: some linters accept --fix / --write
FIX=0
if [[ "${1:-}" == "--fix" ]]; then
  FIX=1
fi

declare -a biome_fix_arg=()
declare -a eslint_fix_arg=()
declare -a markdown_fix_arg=()
if [[ "${FIX}" -eq 1 ]]; then
  biome_fix_arg=(--write)
  eslint_fix_arg=(--fix)
  markdown_fix_arg=(--fix)
fi

typecheck_script="${PS_TASKS_SCRIPTS}/typecheck.sh"
if [[ ! -f "${typecheck_script}" ]]; then
  typecheck_script="${_formatted_script_dir}/../actions/ps-typecheck/typecheck.sh"
fi

# Banner
PS_BANNER_RULE=0 ps_print_banner
ps_cli_header "LINT CHECK" "npm run lint"
gate_log_start

set +e

# Tier 1 (heavy): start first, async.
run_lint_step_async "lint.typecheck" "TYPECHECK" "Type checking (tsc)" \
  bash "${typecheck_script}"

run_lint_step_async "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/eslint.sh" "${eslint_fix_arg[@]:-}"

run_lint_step_async "lint.knip" "KNIP" "Dependency audit (knip)" \
  bash "${PS_LINT_SCRIPTS}/knip.sh"

# Tier 2 (light): worker pool (4 light workers + 3 heavy workers).
MAX_LINT_WORKERS=7

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.biome" "BIOME" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/biome.sh" "${biome_fix_arg[@]:-}"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/shellcheck.sh"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.yamllint" "YAMLLINT" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/yamllint.sh"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.actionlint" "ACTIONLINT" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/actionlint.sh"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.hadolint" "HADOLINT" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/hadolint.sh"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.markdown" "MARKDOWN" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/markdownlint.sh" "${markdown_fix_arg[@]:-}"

lint_pool_wait_for_slot "${MAX_LINT_WORKERS}"
run_lint_step_async "lint.cspell" "CSPELL" "Spelling checks" \
  bash "${PS_LINT_SCRIPTS}/cspell.sh"

lint_wait_all
set -e

lint_print_tally || true

# If any lint/typecheck failed, print failed section and exit non-zero
if [[ "${LINT_FAILED:-0}" -ne 0 ]]; then
  ps_print_section \
    "gate.failed" \
    "${GATE_NAME} failed" \
    "One or more lint/typecheck checks failed (see logs/lint/*.log)"
  gate_log_finish "FAIL" 1
  exit 1
fi

print_success

exit 0
