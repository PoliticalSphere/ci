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

# Simple color helpers
ps_supports_color() {
  if [[ -n "${NO_COLOR:-}" && "${NO_COLOR}" != "0" ]]; then
    return 1
  fi
  if [[ "${FORCE_COLOR:-0}" != "0" ]]; then
    return 0
  fi
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
  # Erase previous block if present (TTY)
  if ps_supports_color && [[ "${LINT_SUMMARY_LINES:-0}" -gt 0 ]]; then
    local n=${LINT_SUMMARY_LINES}
    # Move cursor up n lines and clear them reliably (portable across terminals)
    printf '\033[%dA' "$n"
    for ((i=0;i<n;i++)); do
      # Use carriage return before clearing line to ensure cursor at line start
      printf '\r\033[2K\033[1E'
    done
    # Return cursor to original top position
    printf '\033[%dA' "$n"
  fi

  # Header
  local c_reset="" c_bold="" c_dim="" c_cyan="" c_green="" c_red="" c_yellow=""
  if ps_supports_color; then
    c_reset="\033[0m"; c_bold="\033[1m"; c_dim="\033[90m"; c_cyan="\033[36m"; c_green="\033[32m"; c_red="\033[31m"; c_yellow="\033[33m"
    printf "%b%s%b %b%s%b\n" "${c_green}" "${PS_FMT_ICON:-▶}" "${c_reset}" "${c_bold}${c_cyan}" "LINT" "${c_reset}"
  else
    printf "%s %s\n" "${PS_FMT_ICON:-▶}" "LINT & TYPE CHECK"
  fi

  # Indentation for lint rows (align with start of "LINT" header)
  local lint_indent="  " 

  # Column width for labels
  local pad=24


  # Rows
  local pad=24
  local i
  for i in "${!LINT_IDS[@]}"; do
    local label="${LINT_LABELS[$i]}"
    local status="${LINT_STATUSES[$i]}"
    local log="${LINT_LOGS[$i]}"
    printf -v padded "%-${pad}s" "${label}"
    if ps_supports_color; then
        case "$status" in
        PASS)
          printf "%s%s %b%-7s%b   %b%b%b\n" "${lint_indent}" "${padded}" "${c_green}${c_bold}" "PASS" "${c_reset}" "${c_cyan}${c_bold}" "Findings Log" "${c_reset} ${c_dim}(${log})${c_reset}" ;;

        FAIL)
          printf "%s%s %b%-7s%b   %b%b%b\n" "${lint_indent}" "${padded}" "${c_red}${c_bold}" "FAIL" "${c_reset}" "${c_cyan}${c_bold}" "Findings Log" "${c_reset} ${c_dim}(${log})${c_reset}" ;;

        SKIPPED)
          printf "%s%s %b%-7s%b   %b%b%b\n" "${lint_indent}" "${padded}" "${c_yellow}${c_bold}" "SKIPPED" "${c_reset}" "${c_cyan}${c_bold}" "Findings Log" "${c_reset} ${c_dim}(${log})${c_reset}" ;;
        Running*)
          printf "%s%s %b%s%b\n" "${lint_indent}" "${padded}" "${c_cyan}" "Running..." "${c_reset}" ;;
        Waiting)
          printf "%s%s %b%s%b\n" "${lint_indent}" "${padded}" "${c_dim}" "Waiting..." "${c_reset}" ;;
        *)
          printf "    %s %s\n" "${padded}" "${status}" ;;
      esac
    else
      printf "%s%s %s\n" "${lint_indent}" "${padded}" "${status}"
    fi
  done

  LINT_SUMMARY_LINES=$((1 + ${#LINT_IDS[@]}))
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
