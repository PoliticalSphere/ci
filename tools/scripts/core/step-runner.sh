#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Step Runner
# ------------------------------------------------------------------------------
# Purpose:
#   Generic step execution helpers for gates, including:
#   - Standard step execution with logging
#   - Autofix-first pattern for pre-commit gates
#   - Success/completion reporting
#
# Functions:
#   run_step       - Run a step with logging and section headers
#   run_autofix    - Run autofix command and re-stage modified files
#   print_success  - Print gate success message
#
# Dependencies:
#   - ps_epoch_ms (from time-helpers.sh, optional)
#   - ps_log (from format.sh, optional)
#   - ps_print_section (from format.sh)
#   - gate_log_finish (from gate-logging.sh)
#   - repo_root, GATE_NAME, CURRENT_STEP_ID, CURRENT_STEP_TITLE
#
# Sourced by:
#   - tools/scripts/gates/gate-common.sh
# ==============================================================================
[[ -n "${_PS_STEP_RUNNER_LOADED:-}" ]] && return 0
_PS_STEP_RUNNER_LOADED=1

# ----------------------------
# Generic step runner
# ----------------------------

# Usage: run_step <id> <title> <description> <command...>
run_step() {
  local id="$1"
  local title="$2"
  # shellcheck disable=SC2034
  local description="$3"
  shift 3

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"

  local start_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    start_ms="$(ps_epoch_ms)"
  fi
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info gate.step.start \
      "id=${id}" \
      "title=${title}" \
      "detail=${description}"
  fi

  ps_print_section "${id}" "${title}" "${description}"
  set +e
  "$@"
  local rc=$?
  set -e

  if command -v ps_log >/dev/null 2>&1; then
    local end_ms=""
    local duration_ms=""
    if command -v ps_epoch_ms >/dev/null 2>&1; then
      end_ms="$(ps_epoch_ms)"
    fi
    if [[ -n "${start_ms}" && -n "${end_ms}" ]]; then
      duration_ms=$((end_ms - start_ms))
    fi

    local level="info"
    if [[ "${rc}" -ne 0 ]]; then
      level="error"
    fi
    ps_log "${level}" gate.step.finish \
      "id=${id}" \
      "title=${title}" \
      "status=$([[ "${rc}" -eq 0 ]] && printf '%s' PASS || printf '%s' FAIL)" \
      "exit_code=${rc}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi

  if [[ "${rc}" -ne 0 ]]; then
    return "${rc}"
  fi
  return 0
}

# ----------------------------
# Autofix-First Helper
# ----------------------------
# Runs an autofix command (e.g., biome --write, eslint --fix), then re-stages
# any modified files. This enables the "autofix-first" pre-commit pattern where
# fixable issues are corrected automatically before the lint check.
#
# Usage: run_autofix <tool_name> <command...>
# Example: run_autofix "biome" bash tools/scripts/runners/lint/biome.sh --write
#
# Returns 0 if autofix ran (even if it fixed nothing), non-zero on error.

run_autofix() {
  local tool_name="$1"
  shift

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info autofix.start "tool=${tool_name}"
  fi

  # Capture currently staged files before autofix
  local staged_before=""
  staged_before="$(git diff --cached --name-only 2>/dev/null || true)"

  # Run the autofix command, allowing it to fail (we'll still re-stage)
  set +e
  "$@" >/dev/null 2>&1
  local rc=$?
  set -e

  # Re-stage any files that were originally staged (to include fixes)
  if [[ -n "${staged_before}" ]]; then
    local restaged_count=0
    while IFS= read -r file; do
      if [[ -f "${repo_root}/${file}" ]]; then
        git add "${repo_root}/${file}" 2>/dev/null || true
        ((restaged_count++)) || true
      fi
    done <<< "${staged_before}"

    if [[ "${restaged_count}" -gt 0 ]] && command -v ps_log >/dev/null 2>&1; then
      ps_log info autofix.restaged "tool=${tool_name}" "count=${restaged_count}"
    fi
  fi

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info autofix.complete "tool=${tool_name}" "exit_code=${rc}"
  fi

  return 0
}

# ----------------------------
# Success printer
# ----------------------------

print_success() {
  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  ps_print_section \
    "gate.ok" \
    "${GATE_NAME:-Gate} gate passed" \
    "All checks completed successfully"
  gate_log_finish "PASS" 0
  return 0
}
