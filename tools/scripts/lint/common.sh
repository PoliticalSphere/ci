#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Lint Common Helpers
# ------------------------------------------------------------------------------
# Provides:
#   - repo_root / git detection
#   - full-scan decision logic (PS_FULL_SCAN, CI, PR SHAs, git availability)
#   - robust target collection:
#       * staged (NUL-safe)
#       * PR diff (SHA-aware, retry fetch)
#       * find-based (array form, no eval)
#   - retry helper for flaky CI fetches
#
# Contract:
#   - Consumers may read:
#       repo_root (string), has_git (0/1), full_scan (0/1), targets (array)
#   - Consumers call:
#       set_repo_root_and_git; set_full_scan_flag; collect_targets_staged/find/pr
# ==============================================================================

# Globals (initialised for shellcheck clarity)
repo_root=""
has_git=0
full_scan="0"
targets=()
format_loaded=0
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Lint structured logging context
LINT_LOG_ID=""
LINT_LOG_TITLE=""
LINT_LOG_DESC=""
LINT_LOG_MODE=""
LINT_LOG_TARGET_COUNT=""
LINT_LOG_STATUS_OVERRIDE=""
LINT_LOG_START_MS=""

# shellcheck source=tools/scripts/common/retry.sh
. "${script_dir}/../common/retry.sh"

# ----------------------------
# Internal helpers
# ----------------------------
_ps_realpath_dir() {
  # Canonicalise a directory path without requiring readlink -f (macOS safe).
  local d="$1"
  if ( cd "$d" >/dev/null 2>&1 ); then
    ( cd "$d" >/dev/null 2>&1 && pwd -P )
  else
    printf '%s' "$d"
  fi
  return 0
}

_ps_has_git() {
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  return 0
}

# ----------------------------
# Public: repo root + format loader
# ----------------------------
set_repo_root_and_git() {
  if _ps_has_git; then
    repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    has_git=1
  else
    repo_root="$(pwd)"
    has_git=0
  fi

  repo_root="$(_ps_realpath_dir "${repo_root}")"

  # Load format helpers once (if present)
  if [[ "${format_loaded}" == "0" ]]; then
    local format_sh="${repo_root}/tools/scripts/branding/format.sh"
    if [[ -f "${format_sh}" ]]; then
      # shellcheck source=tools/scripts/branding/format.sh
      . "${format_sh}"
      format_loaded=1
    fi
  fi

  if [[ -f "${repo_root}/tools/scripts/egress.sh" ]]; then
    # shellcheck source=tools/scripts/egress.sh
    . "${repo_root}/tools/scripts/egress.sh"
    load_egress_allowlist || return 1
  fi

  return 0
}

ensure_repo_root_and_git() {
  if [[ -z "${repo_root:-}" ]]; then
    set_repo_root_and_git
  fi
  return 0
}

assert_lint_egress_allowed() {
  if declare -F assert_egress_allowed_git_remote >/dev/null 2>&1; then
    assert_egress_allowed_git_remote origin
  fi
  return 0
}

# ----------------------------
# Public: full scan decision
# ----------------------------
set_full_scan_flag() {
  ensure_repo_root_and_git
  full_scan="${PS_FULL_SCAN:-0}"

  # If we have no git, staged/PR diff logic cannot work.
  if [[ "${has_git:-0}" == "0" ]]; then
    full_scan="1"
  fi

  # CI behaviour:
  # - If PR SHAs provided, allow affected-only tools to decide targets via collect_targets_pr
  # - Otherwise, default to full scan in CI for safety
  if [[ "${CI:-0}" == "1" ]]; then
    if [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
      : # keep full_scan as requested (default 0) so tools can do affected-only
    else
      full_scan="1"
    fi
  fi

  : "${full_scan:-}"
  return 0
}

# ----------------------------
# Public: structured lint logging helpers
# ----------------------------
lint_log_mode() {
  if [[ "${full_scan:-0}" == "1" ]]; then
    printf '%s' "full"
  else
    printf '%s' "staged"
  fi
  return 0
}

lint_log_set_targets() {
  LINT_LOG_TARGET_COUNT="${1:-}"
  return 0
}

lint_log_set_status() {
  LINT_LOG_STATUS_OVERRIDE="${1:-}"
  return 0
}

_lint_log_finish() {
  local rc="${1:-0}"
  local end_ms=""
  local duration_ms=""
  local status=""

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  else
    end_ms="$(date -u +%s 2>/dev/null || date +%s)"
    end_ms="$((end_ms * 1000))"
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

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    LINT_LOG_START_MS="$(ps_epoch_ms)"
  else
    LINT_LOG_START_MS="$(date -u +%s 2>/dev/null || date +%s)"
    LINT_LOG_START_MS="$((LINT_LOG_START_MS * 1000))"
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

# ----------------------------
# Public: relative target conversion (repo-root aware)
# ----------------------------
set_relative_targets() {
  ensure_repo_root_and_git
  relative_targets=()
  for target in "${targets[@]}"; do
    if [[ "${target}" == "${repo_root}/"* ]]; then
      relative_targets+=("${target#"${repo_root}"/}")
    else
      relative_targets+=("${target}")
    fi
  done
  return 0
}

# ----------------------------
# Public: find-based target collection (array form, no eval)
# ----------------------------
# collect_targets_find <args...>
# Example:
#   collect_targets_find -name "*.md"
#   collect_targets_find \( -name "*.yml" -o -name "*.yaml" \)
collect_targets_find() {
  targets=()

  # If repo_root not set yet, do it (best effort)
  if [[ -z "${repo_root:-}" ]]; then
    set_repo_root_and_git
  fi

  while IFS= read -r -d '' f; do
    targets+=("${f}")
  done < <(
    find "${repo_root}" -type f "$@" \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -not -path "*/build/*" \
      -not -path "*/coverage/*" \
      -not -path "*/reports/*" \
      -print0
  )

  return 0
}

# ----------------------------
# Public: PR diff target collection (affected files)
# ----------------------------
# collect_targets_pr <shell-glob>
# Requires: PS_PR_BASE_SHA + PS_PR_HEAD_SHA
collect_targets_pr() {
  local pattern="$1"
  targets=()

  ensure_repo_root_and_git
  [[ "${has_git:-0}" == "1" ]] || return 1
  [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]] || return 1

  # Ensure commits exist locally; fetch shallow if missing.
  if ! (git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null && git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null); then
    assert_lint_egress_allowed
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin "${PS_PR_BASE_SHA}" >/dev/null 2>&1 || true
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin "${PS_PR_HEAD_SHA}" >/dev/null 2>&1 || true
  fi

  local -a diff_files=()
  if git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null && git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
    while IFS= read -r f; do
      diff_files+=("$f")
    done < <(git diff --name-only "${PS_PR_BASE_SHA}" "${PS_PR_HEAD_SHA}")
  elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    while IFS= read -r f; do
      diff_files+=("$f")
    done < <(git diff --name-only HEAD~1 HEAD)
  else
    return 1
  fi

  local f
  for f in "${diff_files[@]}"; do
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern}) targets+=("${repo_root}/${f}") ;;
      *) : ;;
    esac
  done

  return 0
}

# ----------------------------
# Public: staged target collection (NUL-safe)
# ----------------------------
# collect_targets_staged <shell-glob>
# Example:
#   collect_targets_staged "*.md"
#   collect_targets_staged "*.yml|*.yaml"  (note: '|' works because case patterns support it)
collect_targets_staged() {
  local pattern="$1"
  targets=()

  ensure_repo_root_and_git
  [[ "${has_git:-0}" == "1" ]] || return 1

  # In CI PR context, prefer affected files (if available).
  if [[ "${CI:-0}" == "1" && -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
    if collect_targets_pr "${pattern}"; then
      return 0
    fi
  fi

  # NUL-safe staged list
  local -a staged_files=()
  while IFS= read -r -d '' f; do
    staged_files+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z)

  # If nothing staged, exit cleanly
  if [[ "${#staged_files[@]}" -eq 0 ]]; then
    return 0
  fi

  local f
  for f in "${staged_files[@]}"; do
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern}) targets+=("${repo_root}/${f}") ;;
      *) : ;;
    esac
  done

  return 0
}
