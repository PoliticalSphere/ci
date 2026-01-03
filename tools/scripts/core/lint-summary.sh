#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Lint Summary UI
# ------------------------------------------------------------------------------
# Purpose:
#   UI functions for displaying lint summary tables with inline updating,
#   status tracking, and TTY-aware output.
#
# Key UX rules:
#   - NEVER print an "all Waiting" summary block (prevents end-of-run spam)
#   - In non-TTY/CI, never spam repeated summary blocks
#   - In TTY, inline updates are enabled by default (cursor-safe)
#   - Summary avoids long absolute paths to prevent wrapping
#
# Functions:
#   _ps_is_interactive_tty    - Check if running in interactive TTY
#   _lint_any_started         - True if any step has started
#   _lint_all_waiting         - True if all steps still waiting
#   _short_log_ref            - Get short log reference for display
#   _ps_erase_inline_block    - Erase previous inline summary block
#   _ps_should_print_summary_now - Determine if summary should print
#   print_lint_summary        - Print/update the lint summary table
#   lint_print_final          - Force-print final summary
#   lint_print_tally          - Print pass/fail/skip tally line
#
# State variables (expected from caller):
#   LINT_IDS, LINT_LABELS, LINT_STATUSES, LINT_LOGS, LINT_DIR
#   LINT_SUMMARY_LINES, LINT_SUMMARY_EVER_PRINTED, LINT_SUMMARY_EVER_STARTED
#   PS_LINT_INLINE, PS_LINT_PRINT_MODE, PS_FMT_RULE_CHAR
#
# Dependencies:
#   - repo_root (from gate-common.sh or caller)
#   - PS_LINT_SUMMARY_RULE_LEN (optional, defaults to 78)
#
# Sourced by:
#   - tools/scripts/gates/gate-common.sh
# ==============================================================================
[[ -n "${_PS_LINT_SUMMARY_LOADED:-}" ]] && return 0
_PS_LINT_SUMMARY_LOADED=1

# ----------------------------
# TTY detection
# ----------------------------

_ps_is_interactive_tty() {
  [[ -t 1 ]] || return 1
  [[ -n "${TERM:-}" && "${TERM}" != "dumb" ]] || return 1
  [[ "${CI:-0}" == "0" ]] || return 1
  return 0
}

# ----------------------------
# Status helpers
# ----------------------------

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

# ----------------------------
# Inline erase helpers
# ----------------------------

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

# ----------------------------
# Print decision logic
# ----------------------------

_ps_should_print_summary_now() {
  local allow_early_print=0
  case "${PS_LINT_PRINT_MODE}" in
    first)
      allow_early_print=1
      ;;
    auto)
      if [[ "${PS_LINT_INLINE:-1}" == "0" ]]; then
        allow_early_print=1
      fi
      if ! _ps_is_interactive_tty; then
        allow_early_print=1
      fi
      ;;
    *)
      allow_early_print=0
      ;;
  esac

  if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
    allow_early_print=1
  fi

  if [[ "${LINT_SUMMARY_EVER_STARTED:-0}" -eq 1 ]]; then
    _lint_any_started || return 1
  else
    [[ "${allow_early_print}" -eq 1 ]] || return 1
  fi

  case "${PS_LINT_PRINT_MODE}" in
    never) return 1 ;;
    final) return 1 ;;
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

# ----------------------------
# Main summary printer
# ----------------------------

print_lint_summary() {
  local force="${1:-0}"

  # Avoid printing initial waiting summary in inline mode
  if [[ "${force}" -ne 1 ]] && \
    [[ "${PS_LINT_PRINT_MODE:-}" == "inline" ]] && \
    _ps_is_interactive_tty && \
    _lint_all_waiting; then
    return 0
  fi

  if [[ "${force}" -ne 1 ]] && 
    { [[ -n "${GITHUB_RUN_ID:-}" ]] || [[ "${CI:-0}" == "1" ]] || [[ "${PS_LINT_INLINE:-1}" == "0" ]]; }; then
    :
  else
    _ps_should_print_summary_now || return 0
  fi

  # Deduplicate header across processes when GITHUB_RUN_ID is set
  if [[ "${force}" -ne 1 && -n "${GITHUB_RUN_ID:-}" ]]; then
    mkdir -p "${LINT_DIR}"
    find "${LINT_DIR}" -maxdepth 1 -name ".summary_printed_*" -mmin +1 -exec rm -rf {} \; || true
    header_dir="${LINT_DIR}/.summary_printed_${GITHUB_RUN_ID}.d"
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
    printf '%s' "${buf}" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' > "${LINT_DIR}/summary.txt"
  fi

  LINT_SUMMARY_LINES=$(( 5 + ${#LINT_IDS[@]} ))
  LINT_SUMMARY_EVER_PRINTED=1
  return 0
}

# ----------------------------
# Final summary helpers
# ----------------------------

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
