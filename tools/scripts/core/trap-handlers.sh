#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Trap Handlers
# ------------------------------------------------------------------------------
# Purpose:
#   Error trapping and signal handling for gate scripts.
#   Provides step-aware error reporting and clean exit on signals.
#
# Functions:
#   _ps_last_command  - Get the last executed command
#   on_error          - ERR trap handler with step context
#   (traps)           - Sets ERR, INT, TERM traps
#
# Dependencies:
#   - ps_print_section (from format.sh)
#   - gate_log_finish (from gate-logging.sh)
#   - GATE_NAME, CURRENT_STEP_ID, CURRENT_STEP_TITLE
#
# Sourced by:
#   - tools/scripts/gates/gate-common.sh
# ==============================================================================
[[ -n "${_PS_TRAP_HANDLERS_LOADED:-}" ]] && return 0
_PS_TRAP_HANDLERS_LOADED=1

# ----------------------------
# Helpers
# ----------------------------

_ps_last_command() {
  printf '%s' "${BASH_COMMAND:-}"
  return 0
}

# ----------------------------
# Error handler
# ----------------------------

on_error() {
  local exit_code="$?"
  local cmd=""
  cmd="$(_ps_last_command)"
  local where=""
  if [[ ${#BASH_LINENO[@]} -gt 0 ]]; then where="line ${BASH_LINENO[0]}"; fi

  echo >&2
  if [[ -n "${CURRENT_STEP_ID:-}" ]]; then
    ps_print_section \
      "gate.failed" \
      "${GATE_NAME:-Gate} gate failed" \
      "Failed at: ${CURRENT_STEP_ID} — ${CURRENT_STEP_TITLE} (exit ${exit_code})${where:+, ${where}}"
  else
    printf 'ERROR: %s gate failed (exit %s)%s\n' "${GATE_NAME:-Gate}" "${exit_code}" "${where:+ at ${where}}" >&2
  fi

  if [[ -n "${cmd}" ]]; then
    printf 'Last command: %s\n' "${cmd}" >&2
  fi

  gate_log_finish "FAIL" "${exit_code}"
  exit "${exit_code}"
}

# ----------------------------
# Set traps
# ----------------------------

trap on_error ERR
trap 'exit 130' INT
trap 'exit 143' TERM
