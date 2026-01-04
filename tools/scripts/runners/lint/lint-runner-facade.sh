#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Lint Runner Facade
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/lint/lint-runner-facade.sh
#   file_type: script
#   language: bash
#   version: 2.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# FACADE for lint runner helpers. This file provides backward compatibility
# for existing lint runners while delegating to the new modular core.
#
# All functionality is now provided by core modules:
#   - core/runner-base.sh     - Runner abstraction (targets, exec, status)
#   - core/path-resolution.sh - Repo root discovery
#   - core/validation.sh      - Input validation
#   - core/logging.sh         - Structured logging
#
# DEPRECATION NOTICE
# -----------------------------------------------------------------------------
# Direct usage of this file's functions is DEPRECATED. New runners should
# use core/runner-base.sh directly. This facade exists for backward
# compatibility with existing runners during migration.
#
# LEGACY INTERFACE
# -----------------------------------------------------------------------------
# For backward compatibility, this facade exports:
#
# Variables:
#   repo_root         - Repository root path (use PS_REPO_ROOT instead)
#   has_git           - 1 if in git repo (use ps_git_has_repo() instead)
#   full_scan         - 1 if full scan mode (use RUNNER_MODE instead)
#   targets           - Array of target files (use RUNNER_TARGETS instead)
#
# Functions:
#   set_repo_root_and_git()     - Initialize repo context
#   set_full_scan_flag()        - Determine scan mode
#   collect_targets_staged()    - Collect staged files
#   collect_targets_find()      - Collect files via find
#   collect_targets_pr()        - Collect PR diff files
#   set_relative_targets()      - Convert to relative paths
#   is_excluded_path()          - Check exclusion patterns
#   lint_log_init()             - Initialize lint logging
#   lint_log_set_targets()      - Set target count
#   lint_log_set_status()       - Set status override
#   lint_log_mode()             - Get mode string
#
# ==============================================================================

# Prevent double-sourcing
[[ -n "${_PS_LINT_COMMON_LOADED:-}" ]] && return 0
_PS_LINT_COMMON_LOADED=1

# -----------------------------------------------------------------------------
# Load Core Modules
# -----------------------------------------------------------------------------
_lint_common_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_core_dir="${_lint_common_dir}/../../core"

# Load runner base (provides most functionality)
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_core_dir}/runner-base.sh"

# Load base helpers for legacy compatibility
# shellcheck source=tools/scripts/core/base-helpers.sh
. "${_core_dir}/base-helpers.sh"

# -----------------------------------------------------------------------------
# Legacy Global Variables (mapped from core)
# -----------------------------------------------------------------------------
repo_root="${PS_REPO_ROOT:-}"
has_git=0
if ps_git_has_repo; then
  has_git=1
fi
full_scan="0"
targets=()

# Standard exclusion pattern (re-exported from runner-base)
PS_LINT_EXCLUDE_PATTERN="${RUNNER_EXCLUDE_PATTERN:-*/node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/reports/*|*/.git/hooks/*}"
export PS_LINT_EXCLUDE_PATTERN

# Lint logging state (legacy)
LINT_LOG_ID=""
LINT_LOG_TITLE=""
LINT_LOG_DESC=""
LINT_LOG_MODE=""
LINT_LOG_TARGET_COUNT=""
LINT_LOG_STATUS_OVERRIDE=""
LINT_LOG_START_MS=""

# -----------------------------------------------------------------------------
# Legacy Facade Functions
# -----------------------------------------------------------------------------

# set_repo_root_and_git
# Initialize repo context (legacy interface)
set_repo_root_and_git() {
  repo_root="${PS_REPO_ROOT}"
  has_git=0
  if ps_git_has_repo; then
    has_git=1
  fi
  
  # Load format.sh if available
  if [[ -f "${PS_REPO_ROOT}/tools/scripts/branding/format.sh" ]]; then
    # shellcheck source=tools/scripts/branding/format.sh
    . "${PS_REPO_ROOT}/tools/scripts/branding/format.sh" || true
  fi
  
  return 0
}

# ensure_repo_root_and_git
# Ensure repo context is set (legacy)
ensure_repo_root_and_git() {
  if [[ -z "${repo_root:-}" ]]; then
    set_repo_root_and_git
  fi
  return 0
}

# set_full_scan_flag
# Determine full scan mode (legacy interface)
set_full_scan_flag() {
  ensure_repo_root_and_git
  full_scan="${PS_FULL_SCAN:-0}"

  if [[ "${has_git:-0}" == "0" ]]; then
    full_scan="1"
  fi

  if [[ "${CI:-0}" == "1" ]]; then
    if [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
      : # keep full_scan as requested
    else
      full_scan="1"
    fi
  fi

  return 0
}

# is_excluded_path <path>
# Check if path matches exclusion patterns (delegates to runner-base)
is_excluded_path() {
  runner_is_excluded_path "$@"
}

# lint_log_mode
# Get mode string for logging
lint_log_mode() {
  if [[ "${full_scan:-0}" == "1" ]]; then
    printf '%s' "full"
  else
    printf '%s' "staged"
  fi
  return 0
}

# lint_log_init <id> <title> <desc> <mode>
# Initialize lint logging (legacy interface)
lint_log_init() {
  local id="${1:-}"
  local title="${2:-}"
  local desc="${3:-}"
  local mode="${4:-}"

  LINT_LOG_ID="${id}"
  LINT_LOG_TITLE="${title}"
  LINT_LOG_DESC="${desc}"
  LINT_LOG_MODE="${mode}"
  LINT_LOG_TARGET_COUNT=""
  LINT_LOG_STATUS_OVERRIDE=""

  PS_LOG_COMPONENT="${id}"
  export PS_LOG_COMPONENT

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    LINT_LOG_START_MS="$(ps_epoch_ms)"
  else
    LINT_LOG_START_MS="$(date +%s)000"
  fi

  if command -v ps_log >/dev/null 2>&1; then
    if [[ -n "${desc}" ]]; then
      ps_log info lint.tool.start "id=${id}" "title=${title}" "detail=${desc}" ${mode:+"mode=${mode}"}
    else
      ps_log info lint.tool.start "id=${id}" "title=${title}" ${mode:+"mode=${mode}"}
    fi
  fi

  trap '_lint_log_finish $?' EXIT
  return 0
}

# lint_log_set_targets <count>
# Set target count for logging
lint_log_set_targets() {
  LINT_LOG_TARGET_COUNT="${1:-}"
  return 0
}

# lint_log_set_status <status>
# Set status override for logging
lint_log_set_status() {
  LINT_LOG_STATUS_OVERRIDE="${1:-}"
  return 0
}

# _lint_log_finish <exit_code>
# Finalize lint logging (internal)
_lint_log_finish() {
  local rc="${1:-0}"
  local end_ms=""
  local duration_ms=""
  local status=""

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  else
    end_ms="$(date +%s)000"
  fi

  if [[ -n "${LINT_LOG_START_MS:-}" ]]; then
    duration_ms=$((end_ms - LINT_LOG_START_MS))
  fi

  if [[ -n "${LINT_LOG_STATUS_OVERRIDE:-}" ]]; then
    status="${LINT_LOG_STATUS_OVERRIDE}"
  elif [[ "${rc}" -eq 0 ]]; then
    status="PASS"
  else
    status="FAIL"
  fi

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info lint.tool.finish \
      "id=${LINT_LOG_ID}" \
      "title=${LINT_LOG_TITLE}" \
      "status=${status}" \
      "exit_code=${rc}" \
      ${duration_ms:+"duration_ms=${duration_ms}"} \
      ${LINT_LOG_MODE:+"mode=${LINT_LOG_MODE}"} \
      ${LINT_LOG_TARGET_COUNT:+"target_count=${LINT_LOG_TARGET_COUNT}"}
  fi

  return 0
}

# -----------------------------------------------------------------------------
# Target Collection (Legacy Interface)
# -----------------------------------------------------------------------------

# collect_targets_find <find_args...>
# Collect files via find command
collect_targets_find() {
  targets=()
  ensure_repo_root_and_git

  while IFS= read -r -d '' f; do
    targets+=("${f}")
  done < <(
    find "${repo_root}" -type f "$@" \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -not -path "*/build/*" \
      -not -path "*/coverage/*" \
      -not -path "*/reports/*" \
      -print0 2>/dev/null || true
  )

  return 0
}

# collect_targets_pr <pattern>
# Collect PR diff targets
collect_targets_pr() {
  local pattern="$1"
  targets=()

  ensure_repo_root_and_git
  [[ "${has_git:-0}" == "1" ]] || return 1
  [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]] || return 1

  # Ensure commits exist locally
  if ! git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null || \
     ! git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
    git fetch --no-tags --depth=1 origin "${PS_PR_BASE_SHA}" 2>/dev/null || true
    git fetch --no-tags --depth=1 origin "${PS_PR_HEAD_SHA}" 2>/dev/null || true
  fi

  local -a diff_files=()
  if git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null && \
     git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
    while IFS= read -r f; do
      diff_files+=("$f")
    done < <(git diff --name-only "${PS_PR_BASE_SHA}" "${PS_PR_HEAD_SHA}" 2>/dev/null || true)
  elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    while IFS= read -r f; do
      diff_files+=("$f")
    done < <(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
  else
    return 1
  fi

  local f
  for f in "${diff_files[@]:-}"; do
    [[ -z "${f}" ]] && continue
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern}) targets+=("${repo_root}/${f}") ;;
    esac
  done

  return 0
}

# collect_targets_staged <pattern>
# Collect staged files matching pattern
collect_targets_staged() {
  local pattern="$1"
  targets=()

  ensure_repo_root_and_git
  [[ "${has_git:-0}" == "1" ]] || return 1

  # In CI PR context, prefer affected files
  if [[ "${CI:-0}" == "1" && -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
    if collect_targets_pr "${pattern}"; then
      return 0
    fi
  fi

  # NUL-safe staged list
  local -a staged_files=()
  while IFS= read -r -d '' f; do
    staged_files+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z 2>/dev/null || true)

  if [[ "${#staged_files[@]}" -eq 0 ]]; then
    return 0
  fi

  local f
  for f in "${staged_files[@]}"; do
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern}) targets+=("${repo_root}/${f}") ;;
    esac
  done

  return 0
}

# set_relative_targets
# Convert targets to relative paths
set_relative_targets() {
  ensure_repo_root_and_git
  relative_targets=()
  local target
  for target in "${targets[@]:-}"; do
    if [[ "${target}" == "${repo_root}/"* ]]; then
      relative_targets+=("${target#"${repo_root}"/}")
    else
      relative_targets+=("${target}")
    fi
  done
  return 0
}

# -----------------------------------------------------------------------------
# Compatibility: Load format.sh helpers
# -----------------------------------------------------------------------------
if [[ -f "${PS_REPO_ROOT}/tools/scripts/branding/format.sh" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${PS_REPO_ROOT}/tools/scripts/branding/format.sh" || true
fi

return 0
