#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC2034
# Reason: this gate defines metadata variables used indirectly (GATE_NAME).

# ==============================================================================
# Political Sphere — Pre-Commit Gate
# ------------------------------------------------------------------------------
# Purpose:
#   Fast local validation prior to commit. Mirrors CI lint gates where possible.
#
# Design:
#   - Deterministic, non-interactive (CI=1)
#   - Structured output (banner + sections)
#   - Fail-fast with clear step attribution
#   - Avoid overengineering: pre-commit must stay fast
# ==============================================================================

# Source shared gate helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${script_dir}/gate-common.sh"

GATE_NAME="Pre-commit"
: "${GATE_NAME:-}"
trap on_error ERR

bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"

# ------------------------------------------------------------------------------
# FAST CHECKS ONLY
# If a step is expensive, it belongs in pre-push or CI.
# Prefer staged/affected operation inside each tool script where possible.
# ------------------------------------------------------------------------------

run_step "lint.biome" "Biome lint" "Formatting and correctness checks" \
  bash "${PS_LINT_SCRIPTS}/biome.sh"

run_step "lint.eslint" "ESLint" "Specialist linting and TS-aware rules" \
  bash "${PS_LINT_SCRIPTS}/eslint.sh"

run_step "lint.yamllint" "YAML lint" "YAML validity and formatting" \
  bash "${PS_LINT_SCRIPTS}/yamllint.sh"

run_step "lint.actionlint" "Actionlint" "GitHub Actions workflow validation" \
  bash "${PS_LINT_SCRIPTS}/actionlint.sh"

run_step "lint.hadolint" "Hadolint" "Dockerfile security and quality" \
  bash "${PS_LINT_SCRIPTS}/hadolint.sh"

run_step "lint.shellcheck" "ShellCheck" "Shell script safety checks" \
  bash "${PS_LINT_SCRIPTS}/shellcheck.sh"

run_step "lint.markdown" "Markdown lint" "Markdown quality checks" \
  bash "${PS_LINT_SCRIPTS}/markdownlint.sh"

run_step "naming.checks" "Naming conventions" "Repository naming policy checks" \
  bash "${PS_NAMING_SCRIPTS}/naming-checks.sh"

run_step "secrets.fast" "Secrets scan (fast)" "Lightweight secret detection" \
  bash "${PS_SECURITY_SCRIPTS}/secret-scan-pr.sh"

# Success summary
print_success
