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

# Always wait for completion before printing the final summary block.
PS_LINT_PRINT_MODE="final"
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

typecheck_script="${PS_TASKS_SCRIPTS}/typecheck.sh"
if [[ ! -f "${typecheck_script}" ]]; then
  typecheck_script="${script_dir}/../actions/ps-typecheck/typecheck.sh"
fi

print_lint_intro() {
  local note="${1:-}"
  local icon="${PS_FMT_ICON:-▶}"
  local rule="${PS_FMT_RULE:-────────────────────────────────────────}"

  if type -t ps_supports_color >/dev/null 2>&1 && ps_supports_color; then
    local c_reset=$'\033[0m'
    local c_bold=$'\033[1m'
    local c_dim=$'\033[90m'
    local c_cyan=$'\033[36m'
    local c_green=$'\033[32m'

    printf "%b%s%b %b%s%b\n" "${c_green}" "${icon}" "${c_reset}" "${c_bold}${c_cyan}" "LINT & TYPE CHECK" "${c_reset}"
    printf "%b%s%b\n" "${c_dim}" "${rule}" "${c_reset}"
  else
    printf '%s %s\n' "${icon}" "LINT & TYPE CHECK"
    printf '%s\n' "${rule}"
  fi

  if [[ -n "${note}" ]]; then
    printf '%s\n' "${note}"
  fi
}

lint_pool_wait_for_slot() {
  local max_workers="${1:?max workers required}"
  local active
  while :; do
    active="$(lint_active_count)"
    if [[ "${active}" -lt "${max_workers}" ]]; then
      return 0
    fi
    lint_wait_one || return 0
  done
}

# Banner
bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"
print_lint_intro "Note: To debug specific issues locally, you can run linters individually using commands like npm run lint:biome."

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

# If configured to print only at the end, do it here (and only here).
lint_print_final || true
lint_print_tally || true

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
