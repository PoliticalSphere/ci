#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Gate Logging Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Structured logging for gate lifecycle events (start/finish).
#   Separated from gate-common.sh for modularity and reuse.
#
# Functions:
#   _ps_slugify      - Convert a name to a safe log component slug
#   gate_log_start   - Log gate start event
#   gate_log_finish  - Log gate finish event with status and duration
#
# Dependencies:
#   - PS_TIMESTAMP_FMT (from gate-common.sh or caller)
#   - ps_epoch_ms (from time-helpers.sh, optional)
#   - ps_log (from format.sh, optional)
#
# Sourced by:
#   - tools/scripts/gates/gate-common.sh
# ==============================================================================
[[ -n "${_PS_GATE_LOGGING_LOADED:-}" ]] && return 0
_PS_GATE_LOGGING_LOADED=1

# ----------------------------
# Gate logging state
# ----------------------------
GATE_LOG_START_MS=""

# ----------------------------
# Helpers
# ----------------------------

# _ps_slugify <name>
# Convert a name to a safe slug for log component IDs
_ps_slugify() {
  local raw="$1"
  local slug
  slug="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9._-')"
  [[ -n "${slug}" ]] || slug="gate"
  printf '%s' "${slug}"
  return 0
}

# gate_log_start
# Log the start of a gate, capturing timestamp for duration calculation
gate_log_start() {
  local gate_name="${GATE_NAME:-Gate}"

  if [[ -z "${PS_LOG_COMPONENT:-}" ]]; then
    PS_LOG_COMPONENT="gate.$(_ps_slugify "${gate_name}")"
  fi

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    GATE_LOG_START_MS="$(ps_epoch_ms)"
  fi

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info gate.start "gate=${gate_name}"
  fi

  return 0
}

# gate_log_finish <status> <exit_code>
# Log the completion of a gate with status and optional duration
gate_log_finish() {
  local status="${1:-PASS}"
  local rc="${2:-0}"
  local end_ms=""
  local duration_ms=""
  local gate_name="${GATE_NAME:-Gate}"

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  fi
  if [[ -n "${GATE_LOG_START_MS:-}" && -n "${end_ms}" ]]; then
    duration_ms=$((end_ms - GATE_LOG_START_MS))
  fi

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info gate.finish \
      "gate=${gate_name}" \
      "status=${status}" \
      "exit_code=${rc}" \
      ${duration_ms:+"duration_ms=${duration_ms}"} \
      ${CURRENT_STEP_ID:+"step_id=${CURRENT_STEP_ID}"} \
      ${CURRENT_STEP_TITLE:+"step_title=${CURRENT_STEP_TITLE}"}
  fi
  return 0
}
