#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Pre-Commit Gate
# ------------------------------------------------------------------------------
# Purpose:
#   Fast local validation prior to commit. Mirrors CI lint gates where possible.
#
# Design:
#   - Fast: only lightweight checks
#   - Deterministic, non-interactive by default
#   - Structured output (banner + sections)
#   - Lint steps never stop early; gate stops before naming/secrets if lint failed
# ==============================================================================

# ----------------------------
# Re-entrancy guard
# ----------------------------
# Pre-commit frameworks sometimes trigger nested runs (e.g., via npm scripts).
# This prevents duplicate output and prevents the gate from running twice.
if [[ -n "${PS_GATE_ACTIVE_PRECOMMIT:-}" ]]; then
  echo "▶ Pre-commit gate already running (skipping nested invocation)"
  exit 0
fi
export PS_GATE_ACTIVE_PRECOMMIT="1"

# ----------------------------
# Gate identity (set BEFORE sourcing common)
# ----------------------------
GATE_NAME="Pre-commit"
export GATE_NAME

# ----------------------------
# Locate + source shared gate helpers
# ----------------------------
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${script_dir}/gate-common.sh"

# ----------------------------
# Behaviour defaults
# ----------------------------
# Pre-commit should be non-interactive, but DO NOT force CI=1 globally if you
# rely on interactive UX; instead prefer "fast mode" flags consumed by tools.
export PS_FAST="${PS_FAST:-1}"
export PS_STAGED_ONLY="${PS_STAGED_ONLY:-1}"

# If you never want the lint dashboard printed during the run, set:
#   export PS_LINT_PRINT_MODE=final
# and call lint_print_final at the end (only if any step started).
export PS_LINT_PRINT_MODE="${PS_LINT_PRINT_MODE:-auto}"

# Banner
bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"

# ------------------------------------------------------------------------------
# FAST CHECKS ONLY
# ------------------------------------------------------------------------------
run_lint_step "lint.biome" "BIOME" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/biome.sh"

run_lint_step "lint.eslint" "ESLINT" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/eslint.sh"

run_lint_step "lint.yamllint" "YAMLLINT" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/yamllint.sh"

run_lint_step "lint.actionlint" "ACTIONLINT" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/actionlint.sh"

run_lint_step "lint.hadolint" "HADOLINT" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/hadolint.sh"

run_lint_step "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/shellcheck.sh"

run_lint_step "lint.markdown" "MARKDOWN" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/markdownlint.sh"

run_lint_step "lint.cspell" "CSPELL" "Spelling checks" \
  bash "${PS_LINT_SCRIPTS}/cspell.sh"

run_lint_step "lint.knip" "KNIP" "Dependency audit (knip)" \
  bash "${PS_LINT_SCRIPTS}/knip.sh"

run_lint_step "lint.typecheck" "TYPECHECK" "Type checking (tsc)" \
  bash "${PS_TASKS_SCRIPTS}/typecheck.sh"

# If configured to print only at the end, do it here (and only here).
if [[ "${PS_LINT_PRINT_MODE}" == "final" ]]; then
  lint_print_final || true
fi

# If any lint/typecheck failed, abort further steps
if [[ "${LINT_FAILED:-0}" -ne 0 ]]; then
  bash "${PS_BRANDING_SCRIPTS}/print-section.sh" \
    "gate.failed" \
    "${GATE_NAME} gate failed" \
    "One or more lint/typecheck checks failed (see logs/lint/*.log)"
  exit 1
fi

run_step "naming.checks" "Naming conventions" "Repository naming policy checks" \
  bash "${PS_NAMING_SCRIPTS}/naming-checks.sh"

run_step "secrets.fast" "Secrets scan (fast)" "Lightweight secret detection" \
  bash "${PS_SECURITY_SCRIPTS}/secret-scan-pr.sh"

print_success
