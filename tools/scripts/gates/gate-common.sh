#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Gate Common (Outstanding, Deterministic, Clean UX)
# ------------------------------------------------------------------------------
# Purpose:
#   Shared helpers for gate entrypoints (pre-commit / pre-push) to provide:
#     - robust repo root discovery
#     - safe, consistent environment defaults
#     - structured failure reporting (step-aware)
#     - lint step runner with per-step logs + optional compact summary UI
#
# Key UX rules:
#   - NEVER print an "all Waiting" summary block (prevents end-of-run spam)
#   - In non-TTY/CI, never spam repeated summary blocks
#   - In TTY, inline updates are enabled by default (cursor-safe)
#   - Summary avoids long absolute paths to prevent wrapping
#
# Caller expectations:
#   - Caller sets: GATE_NAME (e.g., "Pre-commit", "Pre-push")
#
# Env toggles:
#   CI=1                          Prefer CI-friendly behaviour
#   FORCE_COLOR=1                 Force ANSI color output
#   NO_COLOR=1                    Disable ANSI color output
#   PS_LINT_INLINE=1              Enable in-place lint summary updates (TTY only)
#   PS_LINT_PRINT_MODE=auto       auto|inline|first|final|never
#     - auto:   TTY->inline, non-TTY->first
#     - inline: force inline (TTY only; otherwise behaves like first)
#     - first:  print summary once (first time a step starts), never update
#     - final:  never print during run; caller may call lint_print_final
#     - never:  never print summary (still produces per-step logs)
# ==============================================================================

# ----------------------------
# Repo root + paths (portable)
# ----------------------------
_ps_resolve_repo_root() {
  local root=""
  if command -v git >/dev/null 2>&1; then
    root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  fi
  [[ -n "${root}" ]] || root="$(pwd)"

  # Canonicalise without readlink -f (macOS): use pwd -P after cd.
  if ( cd "${root}" 2>/dev/null ); then
    ( cd "${root}" 2>/dev/null && pwd -P )
  else
    printf '%s' "${root}"
  fi
  return 0
}

repo_root="$(_ps_resolve_repo_root)"

tools_scripts="${repo_root}/tools/scripts"
branding_scripts="${tools_scripts}/branding"

if [[ ! -d "${tools_scripts}" ]]; then
  printf 'ERROR: tools/scripts not found at: %s\n' "${tools_scripts}" >&2
  printf '       repo_root resolved to: %s\n' "${repo_root}" >&2
  exit 2
fi
if [[ ! -d "${branding_scripts}" ]]; then
  printf 'ERROR: branding scripts not found at: %s\n' "${branding_scripts}" >&2
  printf '       expected: %s/tools/scripts/branding\n' "${repo_root}" >&2
  exit 2
fi

export PS_TOOLS_SCRIPTS="${tools_scripts}"
export PS_BRANDING_SCRIPTS="${branding_scripts}"
export PS_LINT_SCRIPTS="${tools_scripts}/lint"
export PS_SECURITY_SCRIPTS="${tools_scripts}/security"
export PS_TASKS_SCRIPTS="${tools_scripts}/tasks"
export PS_NAMING_SCRIPTS="${tools_scripts}/naming"

# ----------------------------
# Non-interactive defaults
# ----------------------------
export CI="${CI:-0}"
export FORCE_COLOR="${FORCE_COLOR:-0}"
export NO_COLOR="${NO_COLOR:-0}"

# Timestamp format for logs and messages (RFC-like, UTC)
PS_TIMESTAMP_FMT="${PS_TIMESTAMP_FMT:-%Y-%m-%dT%H:%M:%SZ}"

PS_LINT_INLINE="${PS_LINT_INLINE:-1}"
PS_LINT_PRINT_MODE="${PS_LINT_PRINT_MODE:-auto}"
PS_LINT_SECTION_HEADERS="${PS_LINT_SECTION_HEADERS:-1}"
PS_LINT_STEP_LINES="${PS_LINT_STEP_LINES:-1}"

# ----------------------------
# Structured logging (gate context)
# ----------------------------
GATE_LOG_START_MS=""

_ps_slugify() {
  local raw="$1"
  local slug
  slug="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9._-')"
  [[ -n "${slug}" ]] || slug="gate"
  printf '%s' "${slug}"
  return 0
}

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

# ----------------------------
# Load formatting helpers (single UI spec)
# ----------------------------
format_sh="${branding_scripts}/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

# Fallbacks if format.sh missing (shouldn't happen, but keep gates resilient)
PS_FMT_ICON="${PS_FMT_ICON:-▶}"
PS_FMT_RULE="${PS_FMT_RULE:-────────────────────────────────────────}"

# ----------------------------
# Gate state (error summaries)
# ----------------------------
CURRENT_STEP_ID=""
CURRENT_STEP_TITLE=""

# ----------------------------
# Lint summary state
# ----------------------------
LINT_DIR="${repo_root}/logs/lint"
LINT_IDS=()
LINT_LABELS=()
LINT_STATUSES=()
LINT_LOGS=()
LINT_PIDS=()
LINT_START_MS=()

# Status constants
LINT_STATUS_RUNNING="Running"

# shellcheck disable=SC2034 # read by callers
LINT_FAILED=0
export LINT_FAILED

LINT_SUMMARY_LINES=0
LINT_SUMMARY_EVER_PRINTED=0
LINT_SUMMARY_EVER_STARTED=0

# ==============================================================================
# Traps (step-aware, helpful)
# ==============================================================================
_ps_last_command() {
  printf '%s' "${BASH_COMMAND:-}"
  return 0
}

on_error() {
  local exit_code="$?"
  local cmd=""
  cmd="$(_ps_last_command)"
  local where=""
  if [[ ${#BASH_LINENO[@]} -gt 0 ]]; then where="line ${BASH_LINENO[0]}"; fi

  echo >&2
  if [[ -n "${CURRENT_STEP_ID}" ]]; then
    bash "${branding_scripts}/print-section.sh" \
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

trap on_error ERR
trap 'exit 130' INT
trap 'exit 143' TERM

# ==============================================================================
# Lint summary UI
# ==============================================================================

_ps_is_interactive_tty() {
  [[ -t 1 ]] || return 1
  [[ -n "${TERM:-}" && "${TERM}" != "dumb" ]] || return 1
  [[ "${CI:-0}" == "0" ]] || return 1
  return 0
}

# True if any step has moved past "Waiting".
_lint_any_started() {
  local s
  for s in "${LINT_STATUSES[@]+"${LINT_STATUSES[@]}"}"; do
    case "${s}" in
      Waiting|"") ;;
      *) return 0 ;;
    esac
  done
  return 1
}

# True if all steps are still in the "Waiting" state (or not yet set).
_lint_all_waiting() {
  local s
  for s in "${LINT_STATUSES[@]+"${LINT_STATUSES[@]}"}"; do
    case "${s}" in
      Waiting|"") ;;
      *) return 1 ;;
    esac
  done
  return 0
}

# For printing: show relative path where possible, else basename.
_short_log_ref() {
  local p="${1:-}"
  [[ -n "${p}" ]] || { printf '%s' "-"; return 0; }
  if [[ -n "${repo_root:-}" && "${p}" == "${repo_root}/"* ]]; then
    printf '%s' "${p#"${repo_root}"/}"
    return 0
  fi
  basename -- "${p}"
  return 0
}

_ps_erase_inline_block() {
  local n="${1:-0}"
  [[ "${PS_LINT_INLINE:-1}" == "1" ]] || return 0
  _ps_is_interactive_tty || return 0
  [[ "${n}" -gt 0 ]] || return 0

  # Prefer tput for portability; fall back to raw ANSI if unavailable
  if command -v tput >/dev/null 2>&1; then
    tput cuu "$n" 2>/dev/null || true
    for ((i=0; i<n; i++)); do
      tput el 2>/dev/null || printf '\033[2K'
      printf '\n'
    done
    tput cuu "$n" 2>/dev/null || true
  else
    printf '\033[%dA' "$n"
    for ((i=0; i<n; i++)); do
      printf '\r\033[2K\033[1E'
    done
    printf '\033[%dA' "$n"
  fi
  return 0
}

_ps_should_print_summary_now() {
  # Allow printing in two cases:
  # 1) A lint step has started (usual case)
  # 2) Caller explicitly requests a printed summary even when no steps have started
  #    (e.g., PS_LINT_INLINE=0 and PS_LINT_PRINT_MODE=auto) — useful for non-TTY

  local allow_early_print=0
  case "${PS_LINT_PRINT_MODE}" in
    first)
      allow_early_print=1
      ;;
    auto)
      if [[ "${PS_LINT_INLINE:-1}" == "0" ]]; then
        allow_early_print=1
      fi
      # In non-interactive (non-TTY) CI runs, allow a one-time printed summary
      if ! _ps_is_interactive_tty; then
        allow_early_print=1
      fi
      ;;
    *)
      allow_early_print=0
      ;;
  esac

  # If GITHUB_RUN_ID is present, prefer allowing one printed header across processes
  if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
    allow_early_print=1
  fi

  if [[ "${LINT_SUMMARY_EVER_STARTED:-0}" -eq 1 ]]; then
    # At least one step has started; ensure some step moved beyond Waiting
    _lint_any_started || return 1
  else
    # No step started yet — allow only when caller explicitly requested an early print
    [[ "${allow_early_print}" -eq 1 ]] || return 1
  fi

  case "${PS_LINT_PRINT_MODE}" in
    never) return 1 ;;
    final) return 1 ;; # only via lint_print_final
    inline)
      if _ps_is_interactive_tty && [[ "${PS_LINT_INLINE:-1}" == "1" ]]; then
        return 0
      fi
      [[ "${LINT_SUMMARY_EVER_PRINTED:-0}" -eq 0 ]] && return 0 || return 1
      ;;
    first)
      [[ "${LINT_SUMMARY_EVER_PRINTED:-0}" -eq 0 ]] && return 0 || return 1
      ;;
    auto)
      if _ps_is_interactive_tty && [[ "${PS_LINT_INLINE:-1}" == "1" ]]; then
        return 0
      fi
      [[ "${LINT_SUMMARY_EVER_PRINTED:-0}" -eq 0 ]] && return 0 || return 1
      ;;
    *)
      [[ "${LINT_SUMMARY_EVER_PRINTED:-0}" -eq 0 ]] && return 0 || return 1
      ;;
  esac
}

print_lint_summary() {
  local force="${1:-0}"
  # Allow immediate printing in these common non-interactive scenarios:
  # - running in CI (CI=1)
  # - caller explicitly disabled inline updates (PS_LINT_INLINE=0)
  # - we have a GITHUB_RUN_ID and want to dedupe across processes
  # If caller explicitly requested inline mode and this terminal supports
  # inline updates, avoid printing the initial waiting summary — it creates
  # noisy duplicate output with per-step lines that appear as steps finish.
  if [[ "${force}" -ne 1 ]] && \
    [[ "${PS_LINT_PRINT_MODE:-}" == "inline" ]] && \
    _ps_is_interactive_tty && \
    _lint_all_waiting; then
    return 0
  fi

  if [[ "${force}" -ne 1 ]] && \
    ([[ -n "${GITHUB_RUN_ID:-}" ]] || [[ "${CI:-0}" == "1" ]] || [[ "${PS_LINT_INLINE:-1}" == "0" ]]); then
    :
  else
    _ps_should_print_summary_now || return 0
  fi

  # Deduplicate header across processes when GITHUB_RUN_ID is set
  if [[ "${force}" -ne 1 && -n "${GITHUB_RUN_ID:-}" ]]; then
    mkdir -p "${LINT_DIR}"
    # Remove stale per-run markers older than ~1 minute to avoid leaks across dev runs
    # Use +1 to avoid removing markers created very recently (reduces race/flakiness)
    find "${LINT_DIR}" -maxdepth 1 -name ".summary_printed_*" -mmin +1 -exec rm -rf {} \; || true
    header_dir="${LINT_DIR}/.summary_printed_${GITHUB_RUN_ID}.d"
    # mkdir is atomic — only the first process creating this dir should print
    if mkdir "${header_dir}" 2>/dev/null; then
      :
    else
      return 0
    fi
  fi

  # Only print once per process, except for inline TTY updates.
  if [[ "${force}" -ne 1 && "${LINT_SUMMARY_EVER_PRINTED:-0}" -eq 1 ]] && \
    ! (_ps_is_interactive_tty && [[ "${PS_LINT_INLINE:-1}" == "1" ]] && [[ "${PS_LINT_PRINT_MODE}" == "inline" || "${PS_LINT_PRINT_MODE}" == "auto" ]]); then
    return 0
  fi

  if _ps_is_interactive_tty && [[ "${PS_LINT_INLINE:-1}" == "1" ]] && [[ "${PS_LINT_PRINT_MODE}" != "first" ]]; then
    _ps_erase_inline_block "${LINT_SUMMARY_LINES:-0}"
  fi

  local buf=""
  _append() { local line="$1"; buf+="${line}"$'\n'; return 0; }

  local rule_char="${PS_FMT_RULE_CHAR:-─}"
  local rule=""
  # Build the rule line by repeating the rule_char PS_LINT_SUMMARY_RULE_LEN times
  printf -v rule '%*s' "${PS_LINT_SUMMARY_RULE_LEN:-78}" ''
  rule="${rule// /${rule_char}}"

  _append "${rule}"
  _append " Linter Results"
  _append "${rule}"
  _append ""
  _append "LINTER NAME          STATUS     FINDINGS (LOG REF)"
  _append "─────────────────── ────────── ──────────────────────────────────────────────"

  local name_pad=19
  local status_pad=10

  local i label status log_ref padded_name padded_status
  for i in "${!LINT_IDS[@]}"; do
    label="${LINT_LABELS[$i]}"
    status="${LINT_STATUSES[$i]}"
    log_ref="$(_short_log_ref "${LINT_LOGS[$i]}")"
    printf -v padded_name "%-${name_pad}s" "${label}"
    case "${status}" in
      Running*) status="Running..." ;;
      Waiting) status="Waiting..." ;;
      *) : ;;
    esac
    printf -v padded_status "%-${status_pad}s" "${status}"

    if [[ "${status}" == "PASS" || "${status}" == "FAIL" || "${status}" == "ERROR" || "${status}" == "SKIPPED" ]]; then
      _append "${padded_name} ${padded_status} ${log_ref}"
    else
      _append "${padded_name} ${padded_status}"
    fi
  done

  printf '%s' "${buf}"

  if [[ -n "${LINT_DIR:-}" ]]; then
    mkdir -p "${LINT_DIR}"
    if command -v python3 >/dev/null 2>&1; then
      printf '%s' "${buf}" | python3 - "${LINT_DIR}/summary.txt" <<'PY'
import re
import sys

text = sys.stdin.read()
text = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write(text)
PY
    else
      printf '%s' "${buf}" > "${LINT_DIR}/summary.txt"
    fi
  fi

  # 5 header lines + N rows
  LINT_SUMMARY_LINES=$(( 5 + ${#LINT_IDS[@]} ))
  LINT_SUMMARY_EVER_PRINTED=1
  return 0
}

lint_print_final() {
  local prev="${PS_LINT_PRINT_MODE}"
  local prev_printed="${LINT_SUMMARY_EVER_PRINTED}"
  local prev_started="${LINT_SUMMARY_EVER_STARTED}"
  PS_LINT_PRINT_MODE="first"
  LINT_SUMMARY_EVER_PRINTED=0
  LINT_SUMMARY_EVER_STARTED=1
  print_lint_summary 1
  PS_LINT_PRINT_MODE="${prev}"
  LINT_SUMMARY_EVER_PRINTED="${prev_printed}"
  LINT_SUMMARY_EVER_STARTED="${prev_started}"
  return 0
}

lint_print_tally() {
  local include_logs="${1:-1}"
  local pass=0 fail=0 skipped=0 error=0
  local -a log_refs=()

  local i status log_ref
  for i in "${!LINT_STATUSES[@]}"; do
    status="${LINT_STATUSES[$i]}"
    case "${status}" in
      PASS) pass=$((pass + 1)) ;;
      FAIL)
        fail=$((fail + 1))
        if [[ "${include_logs}" -eq 1 ]]; then
          log_ref="$(_short_log_ref "${LINT_LOGS[$i]}")"
          [[ -n "${log_ref}" ]] && log_refs+=("${log_ref}")
        fi
        ;;
      SKIPPED) skipped=$((skipped + 1)) ;;
      ERROR)
        error=$((error + 1))
        if [[ "${include_logs}" -eq 1 ]]; then
          log_ref="$(_short_log_ref "${LINT_LOGS[$i]}")"
          [[ -n "${log_ref}" ]] && log_refs+=("${log_ref}")
        fi
        ;;
      *) : ;;
    esac
  done

  local line="Summary: ${pass} passed, ${fail} failed, ${skipped} skipped"
  local refs=""
  if [[ "${error}" -gt 0 ]]; then
    line+=", ${error} errors"
  fi
  if [[ "${#log_refs[@]}" -gt 0 ]]; then
    refs="$(printf '%s, ' "${log_refs[@]}")"
    refs="${refs%, }"
    line+=" (see ${refs})"
  fi
  if command -v ps_log >/dev/null 2>&1; then
    local status="PASS"
    if [[ "${fail}" -gt 0 || "${error}" -gt 0 ]]; then
      status="FAIL"
    elif [[ "${pass}" -eq 0 && "${skipped}" -gt 0 ]]; then
      status="SKIPPED"
    fi
    ps_log info lint.summary \
      "status=${status}" \
      "passed=${pass}" \
      "failed=${fail}" \
      "skipped=${skipped}" \
      "errors=${error}" \
      ${refs:+"log_refs=${refs}"}
  fi
  printf '%s\n' "${line}"
  return 0
}

# ==============================================================================
# Lint runner
# ==============================================================================

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

# Usage: lint_finalize_step_by_index <idx> <rc>
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
    case "${status}" in
      FAIL|ERROR) level="error" ;;
      SKIPPED) level="warn" ;;
      *) level="info" ;;
    esac

    ps_log "${level}" lint.step.finish \
      "id=${id}" \
      "title=${title}" \
      "status=${status}" \
      "exit_code=${rc}" \
      "log_path=${log_file}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi

  print_lint_summary
  return 0
}

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

# Usage: run_lint_step <id> <title> <description> <command...>
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

  # locate / register index
  local idx
  idx="$(lint_get_or_register_index "${id}" "${title}" 0)"

  # Mark that we have genuinely started linting (enables summary printing)
  LINT_SUMMARY_EVER_STARTED=1

  print_lint_summary

  mkdir -p "${LINT_DIR}"
  local log_file="${LINT_DIR}/${id}.log"
  local start_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    start_ms="$(ps_epoch_ms)"
  fi
  LINT_START_MS[idx]="${start_ms}"
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info lint.step.start \
      "id=${id}" \
      "title=${title}" \
      "detail=${description}" \
      "log_path=${log_file}"
  fi

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
    case "${status}" in
      FAIL|ERROR) level="error" ;;
      SKIPPED) level="warn" ;;
      *) level="info" ;;
    esac

    ps_log "${level}" lint.step.finish \
      "id=${id}" \
      "title=${title}" \
      "status=${status}" \
      "exit_code=${rc}" \
      "log_path=${log_file}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi

  print_lint_summary

  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  return 0
}

# Usage: run_lint_step_async <id> <title> <description> <command...>
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
    bash "${branding_scripts}/print-section.sh" "${id}" "${title}" "${description}"
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
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info lint.step.start \
      "id=${id}" \
      "title=${title}" \
      "detail=${description}" \
      "log_path=${log_file}" \
      "async=1"
  fi

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

# Usage: wait_lint_step <id>
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
    : # keep draining until no PIDs remain
  done
  return 0
}

# ==============================================================================
# Generic step runner
# ==============================================================================

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

  bash "${branding_scripts}/print-section.sh" "${id}" "${title}" "${description}"
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

print_success() {
  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  bash "${branding_scripts}/print-section.sh" \
    "gate.ok" \
    "${GATE_NAME:-Gate} gate passed" \
    "All checks completed successfully"
  gate_log_finish "PASS" 0
  return 0
}
