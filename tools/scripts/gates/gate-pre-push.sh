#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC2034
# Reason: this gate defines metadata variables used indirectly (GATE_NAME).

# ==============================================================================
# Political Sphere — Pre-Push Gate
# ------------------------------------------------------------------------------
# Purpose:
#   Heavier local validation prior to push. Mirrors CI build/test gates where
#   possible while remaining deterministic and non-interactive.
#
# Ordering rationale:
#   1) Typecheck (fastest high-signal failure)
#   2) Tests (validates behaviour)
#   3) Duplication (design quality)
#   4) Build (packaging / integration)
# ==============================================================================

# Source shared gate helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${script_dir}/gate-common.sh"

GATE_NAME="Pre-push"
: "${GATE_NAME:-}"

format_sh="${PS_BRANDING_SCRIPTS}/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

on_interrupt() {
  echo
  bash "${PS_BRANDING_SCRIPTS}/print-section.sh" \
    "gate.interrupted" \
    "Pre-push gate interrupted" \
    "Interrupted by user or signal"
  exit 130
}

trap on_error ERR
trap on_interrupt INT TERM

# Preflight: fail early with actionable errors
if ! command -v node >/dev/null 2>&1; then
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "node is required but not found on PATH"
  else
    echo "ERROR: node is required but not found on PATH" >&2
  fi
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "npm is required but not found on PATH"
  else
    echo "ERROR: npm is required but not found on PATH" >&2
  fi
  exit 1
fi

bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"

run_step "typecheck" "TypeScript typecheck" "Strict TypeScript checks" \
  bash "${PS_TASKS_SCRIPTS}/typecheck.sh"

run_step "test.unit" "Unit tests" "Deterministic unit tests" \
  bash "${PS_TASKS_SCRIPTS}/test.sh"

run_step "jscpd" "Duplication detection" "Code duplication scanning" \
  bash "${PS_TASKS_SCRIPTS}/jscpd.sh"

run_step "build" "Build" "Deterministic build" \
  bash "${PS_TASKS_SCRIPTS}/build.sh"

print_success
