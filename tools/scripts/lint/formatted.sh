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
#   bash tools/scripts/lint/formatted.sh [--fix]
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# Gate helpers provide the run_lint_step + formatted summary
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${script_dir}/../gates/gate-common.sh"

GATE_NAME="Lint"
export GATE_NAME

# Prefer a single final summary for parallel runs unless overridden.
if [[ "${PS_LINT_PRINT_MODE:-auto}" == "auto" ]]; then
  PS_LINT_PRINT_MODE="final"
fi
export PS_LINT_PRINT_MODE

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

# Banner
bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"

# Run the same steps as pre-commit but in full-scan mode
run_lint_step_async "lint.biome" "BIOME" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/biome.sh" "${biome_fix_arg[@]:-}"

run_lint_step_async "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/eslint.sh" "${eslint_fix_arg[@]:-}"

run_lint_step_async "lint.yamllint" "YAMLLINT" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/yamllint.sh"

run_lint_step_async "lint.actionlint" "ACTIONLINT" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/actionlint.sh"

run_lint_step_async "lint.hadolint" "HADOLINT" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/hadolint.sh"

run_lint_step_async "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/shellcheck.sh"

run_lint_step_async "lint.markdown" "MARKDOWN" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/markdownlint.sh" "${markdown_fix_arg[@]:-}"

run_lint_step_async "lint.cspell" "CSPELL" "Spelling checks" \
  bash "${PS_LINT_SCRIPTS}/cspell.sh"

run_lint_step_async "lint.knip" "KNIP" "Dependency audit (knip)" \
  bash "${PS_LINT_SCRIPTS}/knip.sh"

lint_wait_all

# If configured to print only at the end, do it here (and only here).
lint_print_final || true

# If any lint/typecheck failed, print failed section and exit non-zero
if [[ "${LINT_FAILED:-0}" -ne 0 ]]; then
  bash "${PS_BRANDING_SCRIPTS}/print-section.sh" \
    "gate.failed" \
    "${GATE_NAME} failed" \
    "One or more lint/typecheck checks failed (see logs/lint/*.log)"
  exit 1
fi

print_success

exit 0
