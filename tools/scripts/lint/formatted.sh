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

# Ensure full-scan behaviour
export PS_FULL_SCAN=1

# Handle --fix forwarding: some linters accept --fix / --write
FIX=0
if [[ "${1:-}" == "--fix" ]]; then
  FIX=1
fi

# Helper to run a linter command with optional fix arg
run_cmd_with_optional_fix() {
  local cmd=()
  cmd+=("$@")
  if [[ "${FIX}" -eq 1 ]]; then
    case "${cmd[0]}" in
      *biome.sh) cmd+=("--write") ;;
      *eslint.sh) cmd+=("--fix") ;;
      *markdownlint.sh) cmd+=("--fix") ;;
      *) : ;;
    esac
  fi
  "${cmd[@]}"
  return 0
}

# Banner
bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"

# Run the same steps as pre-commit but in full-scan mode
run_lint_step "lint.biome" "BIOME" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/biome.sh" $( [[ "${FIX}" -eq 1 ]] && printf '%s' "--write")

run_lint_step "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/eslint.sh" $( [[ "${FIX}" -eq 1 ]] && printf '%s' "--fix")

run_lint_step "lint.yamllint" "YAMLLINT" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/yamllint.sh"

run_lint_step "lint.actionlint" "ACTIONLINT" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/actionlint.sh"

run_lint_step "lint.hadolint" "HADOLINT" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/hadolint.sh"

run_lint_step "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/shellcheck.sh"

run_lint_step "lint.markdown" "MARKDOWN" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/markdownlint.sh" $( [[ "${FIX}" -eq 1 ]] && printf '%s' "--fix")

run_lint_step "lint.cspell" "CSPELL" "Spelling checks" \
  bash "${PS_LINT_SCRIPTS}/cspell.sh"

run_lint_step "lint.knip" "KNIP" "Dependency audit (knip)" \
  bash "${PS_LINT_SCRIPTS}/knip.sh"

# If configured to print only at the end, do it here (and only here).
if [[ "${PS_LINT_PRINT_MODE}" == "final" ]]; then
  lint_print_final || true
fi

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
