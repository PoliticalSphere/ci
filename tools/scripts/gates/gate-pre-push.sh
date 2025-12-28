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

# ----------------------------
# Re-entrancy guard
# ----------------------------
if [[ -n "${PS_GATE_ACTIVE_PREPUSH:-}" ]]; then
  echo "▶ Pre-push gate already running (skipping nested invocation)"
  exit 0
fi
export PS_GATE_ACTIVE_PREPUSH="1"

# ----------------------------
# Gate identity (set BEFORE sourcing common)
# ----------------------------
GATE_NAME="Pre-push"
export GATE_NAME

# ----------------------------
# Source shared gate helpers
# ----------------------------
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/gates/gate-common.sh
. "${script_dir}/gate-common.sh"

# ----------------------------
# Behaviour defaults
# ----------------------------
# Pre-push is still local, but tends to be non-interactive.
export PS_FAST="${PS_FAST:-0}"
export PS_FULL_SCAN="${PS_FULL_SCAN:-1}"

# Control spacing in sections if you later use inline summaries elsewhere.
export PS_SECTION_SPACING="${PS_SECTION_SPACING:-1}"

# ----------------------------
# Interrupt handling (single source of truth)
# ----------------------------
on_interrupt() {
  echo
  bash "${PS_BRANDING_SCRIPTS}/print-section.sh" \
    "gate.interrupted" \
    "${GATE_NAME} gate interrupted" \
    "Interrupted by user or signal"
  gate_log_finish "FAIL" 130
  exit 130
}

# We rely on gate-common.sh for ERR handling; we only override INT/TERM here.
trap on_interrupt INT TERM

# ----------------------------
# Preflight: fail early with actionable errors
# ----------------------------
if ! command -v node >/dev/null 2>&1; then
  if command -v ps_error >/dev/null 2>&1; then
    ps_error "node is required but not found on PATH"
  else
    echo "ERROR: node is required but not found on PATH" >&2
  fi
  gate_log_finish "FAIL" 1
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  if command -v ps_error >/dev/null 2>&1; then
    ps_error "npm is required but not found on PATH"
  else
    echo "ERROR: npm is required but not found on PATH" >&2
  fi
  gate_log_finish "FAIL" 1
  exit 1
fi

bash "${PS_BRANDING_SCRIPTS}/print-banner.sh"
gate_log_start

run_step "typecheck" "TypeScript typecheck" "Strict TypeScript checks" \
  bash "${PS_TASKS_SCRIPTS}/typecheck.sh"

run_step "test.unit" "Unit tests" "Deterministic unit tests" \
  bash "${PS_TASKS_SCRIPTS}/test.sh"

run_step "jscpd" "Duplication detection" "Code duplication scanning" \
  bash "${PS_TASKS_SCRIPTS}/jscpd.sh"

run_step "build" "Build" "Deterministic build" \
  bash "${PS_TASKS_SCRIPTS}/build.sh"

print_success
