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
}

_ps_has_git() {
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  return 0
}

# retry_cmd <retries> <sleep_seconds> <command...>
# Rationale: mitigate transient network failures in CI without masking real errors.
retry_cmd() {
  local retries="$1"
  local sleep_s="$2"
  shift 2

  local attempt=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [[ "${attempt}" -ge "${retries}" ]]; then
      return 1
    fi
    sleep "${sleep_s}"
    attempt=$((attempt + 1))
  done
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

  return 0
}

# ----------------------------
# Public: full scan decision
# ----------------------------
set_full_scan_flag() {
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

  [[ "${has_git:-0}" == "1" ]] || return 1
  [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]] || return 1

  # Ensure commits exist locally; fetch shallow if missing.
  if ! (git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null && git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null); then
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
