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
#   bash tools/scripts/lint/formatted-affected.sh [--fix]
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${script_dir}/../gates/gate-common.sh"

GATE_NAME="Lint (affected)"
export GATE_NAME

# Prefer a single final summary for parallel runs unless overridden.
if [[ "${PS_LINT_PRINT_MODE:-auto}" == "auto" ]]; then
  PS_LINT_PRINT_MODE="final"
fi
export PS_LINT_PRINT_MODE

FIX=0
if [[ "${1:-}" == "--fix" ]]; then
  FIX=1
fi

fix_arg=()
if [[ "${FIX}" -eq 1 ]]; then
  fix_arg=(--fix)
fi

# Banner
bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"

# Use the affected script per-linter so target selection is handled there
run_lint_step_async "lint.biome" "BIOME" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" biome "${fix_arg[@]}"

run_lint_step_async "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" eslint "${fix_arg[@]}"

run_lint_step_async "lint.yamllint" "YAMLLINT" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" yaml

run_lint_step_async "lint.actionlint" "ACTIONLINT" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" actionlint

run_lint_step_async "lint.hadolint" "HADOLINT" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" hadolint

run_lint_step_async "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" shellcheck

run_lint_step_async "lint.markdown" "MARKDOWN" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" markdown "${fix_arg[@]}"

run_lint_step_async "lint.cspell" "CSPELL" "Spelling checks" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" cspell

run_lint_step_async "lint.knip" "KNIP" "Dependency audit (knip)" \
  bash "${PS_LINT_SCRIPTS}/affected.sh" knip

lint_wait_all

# Typecheck: we don't run typecheck against affected files by default here — keep
# output consistent with pre-commit gate but it may be skipped in some workflows.

lint_print_final || true

if [[ "${LINT_FAILED:-0}" -ne 0 ]]; then
  bash "${PS_BRANDING_SCRIPTS}/print-section.sh" \
    "gate.failed" \
    "${GATE_NAME} failed" \
    "One or more lint checks failed (see logs/lint/*.log)"
  exit 1
fi

print_success

exit 0
