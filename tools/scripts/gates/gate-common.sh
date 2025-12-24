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

PS_LINT_INLINE="${PS_LINT_INLINE:-1}"
PS_LINT_PRINT_MODE="${PS_LINT_PRINT_MODE:-auto}"

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

# shellcheck disable=SC2034 # read by callers
LINT_FAILED=0
export LINT_FAILED

LINT_SUMMARY_LINES=0
LINT_SUMMARY_EVER_PRINTED=0
LINT_SUMMARY_EVER_STARTED=0

# ==============================================================================
# Traps (step-aware, helpful)
# ==============================================================================
_ps_last_command() { printf '%s' "${BASH_COMMAND:-}"; }

on_error() {
  local exit_code="$?"
  local cmd="$(_ps_last_command)"
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

# For printing: show relative path where possible, else basename.
_short_log_ref() {
  local p="${1:-}"
  [[ -n "${p}" ]] || { printf '%s' "-"; return 0; }
  if [[ -n "${repo_root:-}" && "${p}" == "${repo_root}/"* ]]; then
    printf '%s' "${p#${repo_root}/}"
    return 0
  fi
  basename -- "${p}"
}

_ps_erase_inline_block() {
  local n="${1:-0}"
  [[ "${PS_LINT_INLINE:-1}" == "1" ]] || return 0
  _ps_is_interactive_tty || return 0
  [[ "${n}" -gt 0 ]] || return 0

  printf '\033[%dA' "$n"
  for ((i=0; i<n; i++)); do
    printf '\r\033[2K\033[1E'
  done
  printf '\033[%dA' "$n"
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
  # Allow immediate printing in these common non-interactive scenarios:
  # - running in CI (CI=1)
  # - caller explicitly disabled inline updates (PS_LINT_INLINE=0)
  # - we have a GITHUB_RUN_ID and want to dedupe across processes
  if [[ -n "${GITHUB_RUN_ID:-}" ]] || [[ "${CI:-0}" == "1" ]] || [[ "${PS_LINT_INLINE:-1}" == "0" ]]; then
    :
  else
    _ps_should_print_summary_now || return 0
  fi

  # Deduplicate header across processes when GITHUB_RUN_ID is set
  if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
    mkdir -p "${LINT_DIR}"
    # Remove stale per-run markers older than ~1 minute to avoid leaks across dev runs
    find "${LINT_DIR}" -maxdepth 1 -name ".summary_printed_*" -mmin +0 -exec rm -rf {} \; || true
    header_dir="${LINT_DIR}/.summary_printed_${GITHUB_RUN_ID}.d"
    # mkdir is atomic — only the first process creating this dir should print
    if mkdir "${header_dir}" 2>/dev/null; then
      :
    else
      return 0
    fi
  fi

  # Only print once per process
  if [[ "${LINT_SUMMARY_EVER_PRINTED:-0}" -eq 1 ]]; then
    return 0
  fi

  if _ps_is_interactive_tty && [[ "${PS_LINT_INLINE:-1}" == "1" ]] && [[ "${PS_LINT_PRINT_MODE}" != "first" ]]; then
    _ps_erase_inline_block "${LINT_SUMMARY_LINES:-0}"
  fi

  local use_color=0
  if type -t ps_supports_color >/dev/null 2>&1 && ps_supports_color; then
    use_color=1
  fi

  local c_reset="" c_bold="" c_dim="" c_cyan="" c_green="" c_red="" c_yellow=""
  if [[ "${use_color}" -eq 1 ]]; then
    c_reset=$'\033[0m'
    c_bold=$'\033[1m'
    c_dim=$'\033[90m'
    c_cyan=$'\033[36m'
    c_green=$'\033[32m'
    c_red=$'\033[31m'
    c_yellow=$'\033[33m'
  fi

  local buf=""
  _append() { buf+="$1"$'\n'; }

  local icon="${PS_FMT_ICON:-▶}"
  local rule="${PS_FMT_RULE:-────────────────────────────────────────}"

  if [[ "${use_color}" -eq 1 ]]; then
    _append "${c_green}${icon}${c_reset} ${c_bold}${c_cyan}LINT & TYPE CHECK${c_reset}"
    _append "${c_dim}${rule}${c_reset}"
  else
    _append "${icon} LINT & TYPE CHECK"
    _append "${rule}"
  fi

  local lint_indent="  "
  local pad=24

  local i label status log_ref padded
  for i in "${!LINT_IDS[@]}"; do
    label="${LINT_LABELS[$i]}"
    status="${LINT_STATUSES[$i]}"
    log_ref="$(_short_log_ref "${LINT_LOGS[$i]}")"
    printf -v padded "%-${pad}s" "${label}"

    if [[ "${use_color}" -eq 1 ]]; then
      case "${status}" in
        PASS)     _append "${lint_indent}${padded} ${c_green}${c_bold}PASS${c_reset}   ${c_dim}${log_ref}${c_reset}" ;;
        FAIL)     _append "${lint_indent}${padded} ${c_red}${c_bold}FAIL${c_reset}   ${c_dim}${log_ref}${c_reset}" ;;
        SKIPPED)  _append "${lint_indent}${padded} ${c_yellow}${c_bold}SKIPPED${c_reset}   ${c_dim}${log_ref}${c_reset}" ;;
        Running*) _append "${lint_indent}${padded} ${c_cyan}Running...${c_reset}" ;;
        Waiting)  _append "${lint_indent}${padded} ${c_dim}Waiting...${c_reset}" ;;
        *)        _append "${lint_indent}${padded} ${status}" ;;
      esac
    else
      if [[ "${status}" == "PASS" || "${status}" == "FAIL" || "${status}" == "SKIPPED" ]]; then
        _append "${lint_indent}${padded} ${status}   ${log_ref}"
      else
        _append "${lint_indent}${padded} ${status}"
      fi
    fi
  done

  printf '%s' "${buf}"

  # 2 header lines + N rows
  LINT_SUMMARY_LINES=$(( 2 + ${#LINT_IDS[@]} ))
  LINT_SUMMARY_EVER_PRINTED=1
}

lint_print_final() {
  local prev="${PS_LINT_PRINT_MODE}"
  PS_LINT_PRINT_MODE="first"
  print_lint_summary
  PS_LINT_PRINT_MODE="${prev}"
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
  done

  return 0
}

# Usage: run_lint_step <id> <title> <description> <command...>
run_lint_step() {
  local id="$1"
  local title="$2"
  # shellcheck disable=SC2034
  local description="$3"
  shift 3

  if [[ ${#LINT_IDS[@]} -eq 0 ]]; then
    lint_init
  fi

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"

  # locate / register index
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
    LINT_STATUSES+=("Running")
    LINT_LOGS+=("")
    idx=$(( ${#LINT_IDS[@]} - 1 ))
  else
    LINT_STATUSES[idx]="Running"
  fi

  # Mark that we have genuinely started linting (enables summary printing)
  LINT_SUMMARY_EVER_STARTED=1

  print_lint_summary

  mkdir -p "${LINT_DIR}"
  local log_file="${LINT_DIR}/${id}.log"

  set +e
  "$@" >"${log_file}" 2>&1
  local rc=$?
  set -e

  if [[ ${rc} -ne 0 && ! -s "${log_file}" ]]; then
    {
      printf "No output captured from %s (exit %d)\n" "${id}" "${rc}"
      printf "Timestamp: %s\n" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
      printf "Command: "
      printf '%q ' "$@"
      printf "\n"
    } > "${log_file}"
  fi

  local status="PASS"

  if [[ ${rc} -ne 0 ]]; then
    status="FAIL"

    # Scoped SKIPPED heuristics (only eslint by default)
    if [[ "${id}" == "lint.eslint" ]]; then
      if grep -Eiq "failed to resolve a plugin|Cannot find package 'eslint-plugin-|npm (ERR!|error)|Access token expired|ERR_MODULE_NOT_FOUND" "${log_file}"; then
        status="SKIPPED"
        {
          printf "\nNote: ESLint dependencies/registry access appear missing.\n"
          printf "Fix: npm ci (or install missing eslint plugins) then re-run.\n"
        } >> "${log_file}" || true
      fi
    fi

    if [[ "${status}" == "FAIL" ]]; then
      LINT_FAILED=1
    fi
  else
    if grep -Eiq "no .*files to check|no staged|no .*files to lint" "${log_file}"; then
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

  bash "${branding_scripts}/print-section.sh" "${id}" "${title}" "${description}"
  "$@"
}

print_success() {
  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  bash "${branding_scripts}/print-section.sh" \
    "gate.ok" \
    "${GATE_NAME:-Gate} gate passed" \
    "All checks completed successfully"
}
