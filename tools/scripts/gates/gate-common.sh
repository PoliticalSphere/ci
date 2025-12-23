#!/usr/bin/env bash
set -euo pipefail

# Common helpers for gate scripts (pre-commit, pre-push)
# Expects caller to set GATE_NAME to a friendly name like "Pre-commit" or "Pre-push"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  repo_root="$(pwd)"
fi

tools_scripts="${repo_root}/tools/scripts"
branding_scripts="${tools_scripts}/branding"

export PS_TOOLS_SCRIPTS="${tools_scripts}"
export PS_BRANDING_SCRIPTS="${branding_scripts}"
export PS_LINT_SCRIPTS="${tools_scripts}/lint"
export PS_SECURITY_SCRIPTS="${tools_scripts}/security"
export PS_TASKS_SCRIPTS="${tools_scripts}/tasks"
export PS_NAMING_SCRIPTS="${tools_scripts}/naming"

export CI=1
export FORCE_COLOR="${FORCE_COLOR:-0}"
export NO_COLOR="${NO_COLOR:-0}"

# Track current step for failure summaries.
CURRENT_STEP_ID=""
CURRENT_STEP_TITLE=""

# Lint summary state
LINT_DIR="${repo_root}/logs/lint"
LINT_IDS=()
LINT_LABELS=()
LINT_STATUSES=()
LINT_LOGS=()
# shellcheck disable=SC2034 # LINT_FAILED is read by callers (e.g., gate-pre-commit.sh)
LINT_FAILED=0
export LINT_FAILED
LINT_SUMMARY_LINES=0
# Track whether we've printed the summary at least once (used to avoid
# re-printing the block in non-interactive logs where terminal control
# sequences don't behave as expected).
LINT_SUMMARY_INITIALIZED=0
# Environment toggle: set PS_LINT_INLINE=0 to disable in-place updates entirely
PS_LINT_INLINE="${PS_LINT_INLINE:-1}"

# Simple color helpers
ps_supports_color() {
  # Respect explicit opt-out
  if [[ -n "${NO_COLOR:-}" && "${NO_COLOR}" != "0" ]]; then
    return 1
  fi

  # Respect explicit opt-in
  if [[ "${FORCE_COLOR:-0}" != "0" ]]; then
    return 0
  fi

  # Prefer colors in CI logs by default (unless NO_COLOR is set). Many CI
  # systems are non-TTY but still support color sequences in their logs.
  if [[ "${CI:-0}" != "0" ]]; then
    return 0
  fi

  # Fallback to TTY detection for interactive/local runs
  [[ -t 1 ]] && return 0 || return 1
}

# Initialize default lint block (Waiting states)
lint_init() {
  mkdir -p "${LINT_DIR}"
  LINT_IDS=()
  LINT_LABELS=()
  LINT_STATUSES=()
  LINT_LOGS=()
  LINT_FAILED=0
  LINT_SUMMARY_LINES=0

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

  for s in "${steps[@]}"; do
    local id label
    id="$(printf '%s' "$s" | cut -d'|' -f1)"
    label="$(printf '%s' "$s" | cut -d'|' -f2-)"
    LINT_IDS+=("${id}")
    LINT_LABELS+=("${label}")
    LINT_STATUSES+=("Waiting")
    LINT_LOGS+=("")
  done

  # Show initial compact summary block (no extra banner)
  print_lint_summary
  return 0
} 

# Print a compact, single LINT block and update in-place when possible
print_lint_summary() {
  # If in-place updates are disabled, or the current process will not do
  # interactive in-place updates (no real TTY), and we've already printed
  # the summary once in this process, avoid re-printing it — repeated
  # prints clutter non-interactive logs where cursor movement isn't available.
  if { [[ "${PS_LINT_INLINE:-1}" != "1" ]] || [[ ! -t 1 ]] || [[ -n "${GITHUB_ACTIONS:-}" ]] || [[ "${CI:-0}" == "1" ]] || [[ -z "${TERM:-}" ]] || [[ "${TERM}" == "dumb" ]]; } && [[ "${LINT_SUMMARY_INITIALIZED:-0}" -eq 1 ]]; then
    return 0
  fi

  # Build the full summary into a buffer first so we can compare against
  # the last printed summary (persisted to disk). This lets multiple
  # processes invoked in the same job avoid duplicating identical blocks
  # in CI logs while preserving in-place updates in interactive runs.
  local buf=""

  # Save previous initialized state and use it while building the buffer to
  # avoid changing behavior mid-flight when consulting the cache later.
  local prev_initialized="${LINT_SUMMARY_INITIALIZED:-0}"

  # Helper to append lines to the buffer (preserve color sequences)
  _append() { buf+="$1\n"; }

  # Header: decide whether to print the full banner or a blank line to
  # preserve line counts (use the previous initialized state so we don't
  # flip it before checking for cache dedupe)
  local c_reset="" c_bold="" c_dim="" c_cyan="" c_green="" c_red="" c_yellow=""
  if [[ "${prev_initialized}" -eq 0 ]]; then
    if ps_supports_color; then
      c_reset="\033[0m"; c_bold="\033[1m"; c_dim="\033[90m"; c_cyan="\033[36m"; c_green="\033[32m"; c_red="\033[31m"; c_yellow="\033[33m"
      _append "${c_green}${PS_FMT_ICON:-▶}${c_reset} ${c_bold}${c_cyan}LINT & TYPE CHECK${c_reset}"
    else
      _append "${PS_FMT_ICON:-▶} LINT & TYPE CHECK"
    fi
  else
    _append ""
  fi


  # Indentation and column padding
  local lint_indent="  "
  local pad=24

  if ps_supports_color; then
    c_reset="${c_reset:-\033[0m}"
    c_bold="${c_bold:-\033[1m}"
    c_dim="${c_dim:-\033[90m}"
    c_cyan="${c_cyan:-\033[36m}"
    c_green="${c_green:-\033[32m}"
    c_red="${c_red:-\033[31m}"
    c_yellow="${c_yellow:-\033[33m}"
  fi

  # Rows
  local i padded label status log
  for i in "${!LINT_IDS[@]}"; do
    label="${LINT_LABELS[$i]}"
    status="${LINT_STATUSES[$i]}"
    log="${LINT_LOGS[$i]}"
    printf -v padded "%-${pad}s" "${label}"

    if ps_supports_color; then
      case "$status" in
      PASS)
        _append "${lint_indent}${padded} ${c_green}${c_bold}PASS${c_reset}   ${c_cyan}${c_bold}Findings Log${c_reset} (${log})" ;;

      FAIL)
        _append "${lint_indent}${padded} ${c_red}${c_bold}FAIL${c_reset}   ${c_cyan}${c_bold}Findings Log${c_reset} (${log})" ;;

      SKIPPED)
        _append "${lint_indent}${padded} ${c_yellow}${c_bold}SKIPPED${c_reset}   ${c_cyan}${c_bold}Findings Log${c_reset} (${log})" ;;

      Running*)
        _append "${lint_indent}${padded} ${c_cyan}Running...${c_reset}" ;;

      Waiting)
        _append "${lint_indent}${padded} ${c_dim}Waiting...${c_reset}" ;;

      *)
        _append "    ${padded} ${status}" ;;
      esac
    else
      _append "${lint_indent}${padded} ${status}"
    fi
  done

  # Ensure the lint logs directory exists for our cache file
  mkdir -p "${LINT_DIR}"

  # Compare with last printed summary (persisted). If identical, avoid
  # re-printing to prevent duplicate blocks appearing in CI logs
  local cache_file="${LINT_DIR}/.last_summary"
  local tmp_file="${LINT_DIR}/.last_summary.tmp"
  local meta_file="${LINT_DIR}/.last_summary.meta"
  # Use %b so backslash-escaped sequences (e.g., \033[32m) are interpreted
  # into real ANSI escape characters when written to the temp file.
  printf "%b" "$buf" > "$tmp_file"
  if [[ -f "$cache_file" ]] && cmp -s "$cache_file" "$tmp_file"; then
    # If this is a real GitHub Actions run, only dedupe when the cached
    # summary was written during the same run (compare run ids in meta).
    if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
      if [[ -f "$meta_file" ]] && grep -Fxq "${GITHUB_RUN_ID}" "$meta_file"; then
        rm -f "$tmp_file"
        return 0
      fi
    fi

    # In other CI environments, allow explicit opt-in for cross-process
    # dedupe via PS_LINT_SUMMARY_USE_CACHE=1.
    if [[ "${CI:-0}" == "1" && "${PS_LINT_SUMMARY_USE_CACHE:-0}" == "1" ]]; then
      rm -f "$tmp_file"
      return 0
    fi

    # Otherwise, only skip when we've already initialized the summary in
    # this process (i.e., the second print within the same process).
    if [[ "${prev_initialized}" -eq 1 ]]; then
      rm -f "$tmp_file"
      return 0
    fi
  fi

  # If we reach here, the buffer differs from the last printed summary.
  # Perform in-place erase of the previous block only when attached to a
  # real interactive TTY and in-place updates are enabled (PS_LINT_INLINE=1).
  if [[ "${PS_LINT_INLINE:-1}" == "1" && -t 1 && "${LINT_SUMMARY_LINES:-0}" -gt 0 ]]; then
    local n=${LINT_SUMMARY_LINES}
    printf '\033[%dA' "$n"
    for ((i=0;i<n;i++)); do
      printf '\r\033[2K\033[1E'
    done
    printf '\033[%dA' "$n"
  fi

  # Emit the buffer and persist it; also store the GitHub run id (if any)
  # so future processes in the same Actions run can reliably dedupe.
  # Use %b so backslash-escaped sequences are rendered as ANSI escapes.
  printf "%b\n" "$buf"
  mv "$tmp_file" "$cache_file" || rm -f "$tmp_file"
  printf "%s" "${GITHUB_RUN_ID:-}" > "$meta_file" || true

  LINT_SUMMARY_LINES=$((1 + ${#LINT_IDS[@]}))

  # If we were not initialized previously, mark as initialized now so
  # subsequent calls in this process behave like before.
  if [[ "${prev_initialized}" -eq 0 ]]; then
    LINT_SUMMARY_INITIALIZED=1
  fi

  return 0
}

on_error() {
  local exit_code="$?"
  echo
  if [[ -n "${CURRENT_STEP_ID}" ]]; then
    bash "${branding_scripts}/print-section.sh" \
      "gate.failed" \
      "${GATE_NAME} gate failed" \
      "Failed at: ${CURRENT_STEP_ID} — ${CURRENT_STEP_TITLE} (exit ${exit_code})"
  else
    printf 'ERROR: %s gate failed (exit %s)\n' "${GATE_NAME}" "${exit_code}" >&2
  fi
  exit "${exit_code}"
}

# Run a lint step and update the compact summary in-place.
# Usage: run_lint_step <id> <title> <description> <command...>
run_lint_step() {
  local id="$1"
  local title="$2"
  # shellcheck disable=SC2034
  local description="$3"
  shift 3

  # Initialize the block if needed
  if [[ ${#LINT_IDS[@]} -eq 0 ]]; then
    lint_init
  fi

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"

  # locate index
  local idx=-1
  local j
  for j in "${!LINT_IDS[@]}"; do
    if [[ "${LINT_IDS[$j]}" == "${id}" ]]; then
      idx=${j}
      break
    fi
  done
  if [[ ${idx} -eq -1 ]]; then
    LINT_IDS+=("${id}")
    LINT_LABELS+=("${title}")
    LINT_STATUSES+=("Running")
    LINT_LOGS+=("")
    idx=$(( ${#LINT_IDS[@]} - 1 ))
  else
    LINT_STATUSES[idx]="Running"
  fi

  print_lint_summary

  mkdir -p "${LINT_DIR}"
  local log_file="${LINT_DIR}/${id}.log"

  set +e
  "$@" >"${log_file}" 2>&1
  local rc=$?
  set -e

  # If the command failed but produced no output, write a short diagnostic
  # so the resulting log file isn't empty (helps with debugging flaky failures).
  if [[ ${rc} -ne 0 && ! -s "${log_file}" ]]; then
    # Provide a richer diagnostic so humans and CI logs can reproduce the failure.
    # Group writes into a single redirect to avoid multiple open/close on the file (ShellCheck SC2129).
    {
      printf "No output captured from %s (exit %d)\n" "${id}" "${rc}"
      printf "Timestamp: %s\n" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
      printf "Command: "
      # Print the exact command used (safely quoted) so it's easy to re-run locally.
      printf '%q ' "$@"
      printf "\n"
      printf "Reproduce (full scan): PS_FULL_SCAN=1 bash '%s/%s.sh'\n" "${PS_LINT_SCRIPTS}" "${id#lint.}"
    } > "${log_file}"
  fi

  local status="PASS"
  if [[ ${rc} -ne 0 ]]; then
    status="FAIL"
    LINT_FAILED=1
  else
    if grep -Eiq "no .*files to check|no staged|no .*files to check\.|no .*files to lint" "${log_file}"; then
      status="SKIPPED"
    fi
  fi

  LINT_STATUSES[idx]="${status}"
  LINT_LOGS[idx]="${log_file}"

  print_lint_summary

  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  return 0
}

run_step() {
  local id="$1"
  local title="$2"
  # shellcheck disable=SC2034
  local description="$3"
  shift 3

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"

  bash "${branding_scripts}/print-section.sh" "${id}" "${title}" "${description}"

  # Execute the command exactly as provided.
  "$@"
  return 0
}

print_success() {
  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  bash "${branding_scripts}/print-section.sh" \
    "gate.ok" \
    "${GATE_NAME} gate passed" \
    "All checks completed successfully"
  return 0
}
