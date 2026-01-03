#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Lint Runner
# ------------------------------------------------------------------------------
# Purpose:
#   Core lint step execution engine with sync/async support, status evaluation,
#   PID management, and structured logging.
#
# Functions:
#   lint_init                    - Initialize lint state arrays
#   lint_eval_status             - Evaluate step exit code to status string
#   lint_emit_step_line          - Print per-step status line
#   lint_handle_log_fallback     - Ensure log file has content on failure
#   lint_get_or_register_index   - Get or register a lint step index
#   lint_finalize_step_by_index  - Finalize a completed step
#   lint_finalize_if_done        - Check and finalize if PID finished
#   run_lint_step                - Run a lint step synchronously
#   run_lint_step_async          - Run a lint step asynchronously
#   wait_lint_step               - Wait for a specific async step
#   lint_active_count            - Count of active async steps
#   lint_wait_one                - Wait for one async step to finish
#   lint_wait_all                - Wait for all async steps
#
# State variables (shared with lint-summary.sh):
#   LINT_IDS, LINT_LABELS, LINT_STATUSES, LINT_LOGS, LINT_PIDS, LINT_START_MS
#   LINT_DIR, LINT_FAILED, LINT_STATUS_RUNNING
#   LINT_SUMMARY_EVER_STARTED
#
# Dependencies:
#   - core/lint-summary.sh (print_lint_summary, lint_emit_step_line)
#   - ps_epoch_ms (from time-helpers.sh, optional)
#   - ps_log (from format.sh, optional)
#   - ps_print_section (from format.sh)
#
# Sourced by:
#   - tools/scripts/gates/gate-common.sh
# ==============================================================================
[[ -n "${_PS_LINT_RUNNER_LOADED:-}" ]] && return 0
_PS_LINT_RUNNER_LOADED=1

# ----------------------------
# Lint state (arrays)
# ----------------------------
# Note: These are initialized by lint_init and shared with lint-summary.sh
LINT_STATUS_RUNNING="Running"

# shellcheck disable=SC2034
LINT_FAILED=0
export LINT_FAILED

# ----------------------------
# Initialization
# ----------------------------

lint_init() {
  mkdir -p "${LINT_DIR}"
  LINT_IDS=()
  LINT_LABELS=()
  LINT_STATUSES=()
  LINT_LOGS=()
  LINT_PIDS=()
  LINT_START_MS=()
  LINT_FAILED=0
  LINT_SUMMARY_LINES=0
  LINT_SUMMARY_EVER_PRINTED=0
  LINT_SUMMARY_EVER_STARTED=0

  local -a steps=(
    "lint.biome|BIOME"
    "lint.eslint|ESLINT"
    "lint.yamllint|YAMLLINT"
    "lint.actionlint|ACTIONLINT"
    "lint.hadolint|HADOLINT"
    "lint.shellcheck|SHELLCHECK"
    "lint.markdown|MARKDOWN"
    "lint.cspell|CSPELL"
    "lint.knip|KNIP"
    "lint.typecheck|TYPECHECK"
  )

  local s id label
  for s in "${steps[@]}"; do
    id="${s%%|*}"
    label="${s#*|}"
    LINT_IDS+=("${id}")
    LINT_LABELS+=("${label}")
    LINT_STATUSES+=("Waiting")
    LINT_LOGS+=("")
    LINT_PIDS+=("")
  done

  return 0
}

# ----------------------------
# Status evaluation
# ----------------------------

lint_eval_status() {
  local id="$1"
  local rc="$2"
  local log_file="$3"
  local status="PASS"

  if grep -Eiq "no .*files to check|no .*files to lint|no .*files found|no staged|no dockerfiles found|no workflow files to check" "${log_file}"; then
    printf '%s' "SKIPPED"
    return 0
  fi

  if [[ ${rc} -ne 0 ]]; then
    status="FAIL"

    if grep -Eiq "config not found|cannot read config file|invalid configuration|configuration error|failed to load config|YAMLException:|command not found|Cannot find module|Cannot find package|ERR_MODULE_NOT_FOUND|tsc not found" "${log_file}"; then
      status="ERROR"
    fi

    if [[ "${id}" == "lint.eslint" ]] && \
      grep -Eiq "failed to resolve a plugin|Cannot find package 'eslint-plugin-|npm (ERR!|error)|Access token expired|ERR_MODULE_NOT_FOUND" "${log_file}"; then
      status="ERROR"
      {
        printf "\nNote: ESLint dependencies/registry access appear missing.\n"
        printf "Fix: npm ci (or install missing eslint plugins) then re-run.\n"
      } >> "${log_file}" || true
    fi

    if [[ "${status}" == "FAIL" || "${status}" == "ERROR" ]]; then
      LINT_FAILED=1
    fi
  fi

  printf '%s' "${status}"
  return 0
}

# ----------------------------
# Step line emission
# ----------------------------

lint_emit_step_line() {
  local title="$1"
  local status="$2"
  if [[ "${PS_LINT_STEP_LINES:-1}" == "0" ]]; then
    return 0
  fi
  if [[ "${PS_LINT_PRINT_MODE:-}" == "final" ]]; then
    return 0
  fi
  local print_step_line=1
  if _ps_is_interactive_tty && [[ "${PS_LINT_INLINE:-1}" == "1" ]]; then
    case "${PS_LINT_PRINT_MODE}" in
      inline|auto) print_step_line=0 ;;
      *) : ;;
    esac
  fi
  if [[ "${print_step_line}" -eq 1 ]]; then
    printf '%s %s: %s\n' "${PS_FMT_ICON:-▶}" "${title}" "${status}"
  fi
  return 0
}

# ----------------------------
# Log fallback
# ----------------------------

lint_handle_log_fallback() {
  local id="$1"
  local rc="$2"
  local log_file="$3"
  shift 3
  if [[ ${rc} -ne 0 && ! -s "${log_file}" ]]; then
    {
      printf "No output captured from %s (exit %d)\n" "${id}" "${rc}"
      if [[ -n "${SOURCE_DATE_EPOCH:-}" && "${SOURCE_DATE_EPOCH}" =~ ^[0-9]+$ ]]; then
        if date -u -r "${SOURCE_DATE_EPOCH}" +"${PS_TIMESTAMP_FMT}" >/dev/null 2>&1; then
          printf "Timestamp: %s\n" "$(date -u -r "${SOURCE_DATE_EPOCH}" +"${PS_TIMESTAMP_FMT}")"
        else
          printf "Timestamp: %s\n" "$(date -u -d "@${SOURCE_DATE_EPOCH}" +"${PS_TIMESTAMP_FMT}")"
        fi
      else
        printf "Timestamp: %s\n" "$(date -u +"${PS_TIMESTAMP_FMT}")"
      fi
      if [[ $# -gt 0 ]]; then
        printf "Command: "
        printf '%q ' "$@"
        printf "\n"
      fi
    } > "${log_file}"
  fi
  return 0
}

# ----------------------------
# Logging helpers (internal - reduce duplication)
# ----------------------------

# _lint_log_step_start <id> <title> <description> <log_file> [async]
_lint_log_step_start() {
  local id="$1" title="$2" description="$3" log_file="$4" async="${5:-0}"
  if command -v ps_log >/dev/null 2>&1; then
    if [[ "${async}" -eq 1 ]]; then
      ps_log info lint.step.start \
        "id=${id}" "title=${title}" "detail=${description}" \
        "log_path=${log_file}" "async=1"
    else
      ps_log info lint.step.start \
        "id=${id}" "title=${title}" "detail=${description}" \
        "log_path=${log_file}"
    fi
  fi
}

# _lint_log_step_finish <id> <title> <status> <rc> <log_file> <start_ms>
_lint_log_step_finish() {
  local id="$1" title="$2" status="$3" rc="$4" log_file="$5" start_ms="$6"
  if command -v ps_log >/dev/null 2>&1; then
    local end_ms="" duration_ms=""
    if command -v ps_epoch_ms >/dev/null 2>&1; then
      end_ms="$(ps_epoch_ms)"
    fi
    if [[ -n "${start_ms}" && -n "${end_ms}" ]]; then
      duration_ms=$((end_ms - start_ms))
    fi
    local level="info"
    case "${status}" in
      FAIL|ERROR) level="error" ;;
      SKIPPED) level="warn" ;;
      *) level="info" ;;
    esac
    ps_log "${level}" lint.step.finish \
      "id=${id}" "title=${title}" "status=${status}" \
      "exit_code=${rc}" "log_path=${log_file}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi
}

# ----------------------------
# Index management
# ----------------------------

lint_get_or_register_index() {
  local id="$1"
  local title="$2"
  local needs_pid="${3:-0}"
  local idx=-1 j

  for j in "${!LINT_IDS[@]}"; do
    if [[ "${LINT_IDS[$j]}" == "${id}" ]]; then
      idx="${j}"
      break
    fi
  done

  if [[ "${idx}" -eq -1 ]]; then
    LINT_IDS+=("${id}")
    LINT_LABELS+=("${title}")
    LINT_STATUSES+=("${LINT_STATUS_RUNNING}")
    LINT_LOGS+=("")
    LINT_START_MS+=("")
    if [[ "${needs_pid}" -eq 1 ]]; then
      LINT_PIDS+=("")
    fi
    idx=$(( ${#LINT_IDS[@]} - 1 ))
  else
    LINT_STATUSES[idx]="${LINT_STATUS_RUNNING}"
  fi

  printf '%s' "${idx}"
  return 0
}

# ----------------------------
# Step finalization
# ----------------------------

lint_finalize_step_by_index() {
  local idx="$1"
  local rc="$2"
  local id="${LINT_IDS[$idx]}"
  local title="${LINT_LABELS[$idx]}"
  local log_file="${LINT_LOGS[$idx]}"
  local start_ms="${LINT_START_MS[$idx]}"

  lint_handle_log_fallback "${id}" "${rc}" "${log_file}"
  local status=""
  status="$(lint_eval_status "${id}" "${rc}" "${log_file}")"
  LINT_STATUSES[idx]="${status}"
  LINT_PIDS[idx]=""
  LINT_START_MS[idx]=""

  lint_emit_step_line "${title}" "${status}"
  _lint_log_step_finish "${id}" "${title}" "${status}" "${rc}" "${log_file}" "${start_ms}"

  print_lint_summary
  return 0
}

lint_finalize_if_done() {
  local idx="$1"
  local pid="$2"
  local rc=0
  local state

  state="$(ps -o state= -p "${pid}" 2>/dev/null || true)"
  state="$(printf '%s' "${state}" | tr -d '[:space:]')"
  if [[ -z "${state}" || "${state}" == *Z* ]]; then
    if ! wait "${pid}"; then
      rc=$?
    fi
    lint_finalize_step_by_index "${idx}" "${rc}"
    return 0
  fi

  return 1
}

# ----------------------------
# Synchronous step runner
# ----------------------------

run_lint_step() {
  local id="$1"
  local title="$2"
  local description="$3"
  shift 3

  if [[ ${#LINT_IDS[@]} -eq 0 ]]; then
    lint_init
  fi

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"

  local idx
  idx="$(lint_get_or_register_index "${id}" "${title}" 0)"

  LINT_SUMMARY_EVER_STARTED=1
  print_lint_summary

  mkdir -p "${LINT_DIR}"
  local log_file="${LINT_DIR}/${id}.log"
  local start_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    start_ms="$(ps_epoch_ms)"
  fi
  LINT_START_MS[idx]="${start_ms}"
  _lint_log_step_start "${id}" "${title}" "${description}" "${log_file}" 0

  set +e
  "$@" >"${log_file}" 2>&1
  local rc=$?
  set -e

  lint_handle_log_fallback "${id}" "${rc}" "${log_file}" "$@"
  local status=""
  status="$(lint_eval_status "${id}" "${rc}" "${log_file}")"

  LINT_STATUSES[idx]="${status}"
  LINT_LOGS[idx]="${log_file}"

  lint_emit_step_line "${title}" "${status}"
  _lint_log_step_finish "${id}" "${title}" "${status}" "${rc}" "${log_file}" "${start_ms}"

  print_lint_summary

  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  return 0
}

# ----------------------------
# Asynchronous step runner
# ----------------------------

run_lint_step_async() {
  local id="$1"
  local title="$2"
  local description="$3"
  shift 3

  if [[ ${#LINT_IDS[@]} -eq 0 ]]; then
    lint_init
  fi

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"
  if [[ "${PS_LINT_SECTION_HEADERS:-1}" != "0" ]]; then
    ps_print_section "${id}" "${title}" "${description}"
  fi

  local idx
  idx="$(lint_get_or_register_index "${id}" "${title}" 1)"

  LINT_SUMMARY_EVER_STARTED=1
  print_lint_summary

  mkdir -p "${LINT_DIR}"
  local log_file="${LINT_DIR}/${id}.log"
  local start_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    start_ms="$(ps_epoch_ms)"
  fi
  LINT_START_MS[idx]="${start_ms}"
  _lint_log_step_start "${id}" "${title}" "${description}" "${log_file}" 1

  set +e
  "$@" >"${log_file}" 2>&1 &
  local pid=$!
  set -e

  LINT_PIDS[idx]="${pid}"
  LINT_LOGS[idx]="${log_file}"

  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  return 0
}

# ----------------------------
# Wait helpers
# ----------------------------

wait_lint_step() {
  local id="$1"
  local idx=-1 j
  for j in "${!LINT_IDS[@]}"; do
    if [[ "${LINT_IDS[$j]}" == "${id}" ]]; then
      idx="${j}"
      break
    fi
  done

  [[ "${idx}" -ge 0 ]] || return 0
  local pid="${LINT_PIDS[$idx]}"
  [[ -n "${pid}" ]] || return 0

  local rc=0
  if ! wait "${pid}"; then
    rc=$?
  fi

  lint_finalize_step_by_index "${idx}" "${rc}"
  return 0
}

lint_active_count() {
  local count=0
  local pid
  for pid in "${LINT_PIDS[@]}"; do
    [[ -n "${pid}" ]] && count=$((count + 1))
  done
  printf '%s' "${count}"
  return 0
}

lint_wait_one() {
  local remaining=1
  while [[ "${remaining}" -eq 1 ]]; do
    remaining=0
    local idx pid
    for idx in "${!LINT_PIDS[@]}"; do
      pid="${LINT_PIDS[$idx]}"
      [[ -n "${pid}" ]] || continue

      if lint_finalize_if_done "${idx}" "${pid}"; then
        return 0
      fi

      remaining=1
    done
    if [[ "${remaining}" -eq 1 ]]; then
      sleep 0.2
    fi
  done
  return 1
}

lint_wait_all() {
  while lint_wait_one; do
    :
  done
  return 0
}
