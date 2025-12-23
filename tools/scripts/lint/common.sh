#!/usr/bin/env bash
set -euo pipefail
# Shared helpers for lint scripts.
# Provide default values to keep shellcheck aware of globals.
repo_root=""
has_git=0
full_scan="0"
targets=()
format_loaded=0
# NOTE: Avoid broad file-level shellcheck disables; specific suppressions are
# applied in-place where necessary with a clear rationale.

# Shared helpers for lint scripts.
# - set_repo_root_and_git: detect repo root and whether git is available
# - set_full_scan_flag: set FULL_SCAN variable based on PS_FULL_SCAN, CI and has_git
# - collect_targets_find: populate "targets" array using a find expression
# - collect_targets_staged: populate "targets" array from staged files matching a shell glob

set_repo_root_and_git() {
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -z "${repo_root}" ]]; then
    repo_root="$(pwd)"
    has_git=0
  else
    has_git=1
  fi

  if [[ "${format_loaded}" == "0" ]]; then
    local format_sh="${repo_root}/tools/scripts/branding/format.sh"
    if [[ -f "${format_sh}" ]]; then
      # shellcheck source=tools/scripts/branding/format.sh
      . "${format_sh}"
      format_loaded=1
    fi
  fi
}

set_full_scan_flag() {
  full_scan="${PS_FULL_SCAN:-0}"
  if [[ "${CI:-0}" == "1" ]]; then
    if [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
      : # allow affected-only linting in PR workflows
    else
      full_scan="1"
    fi
  fi
  if [[ "${has_git:-0}" == "0" ]]; then
    full_scan="1"
  fi

  # Mark variable as intentionally used for shellcheck (suppress SC2034)
  : "${full_scan:-}"
}

# collect_targets_find <find-expression>
# Example: collect_targets_find "-name \"*.md\""
collect_targets_find() {
  local find_expr="$*"
  # Split the incoming expression into an array to safely pass separate args
  # to `find` (avoids using eval and satisfies shellcheck concerns).
  local -a expr_arr
  IFS=' ' read -r -a expr_arr <<< "$find_expr"

  targets=()
  while IFS= read -r -d '' f; do
    targets+=("${f}")
  done < <(find "${repo_root}" -type f "${expr_arr[@]}" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/coverage/*" -not -path "*/reports/*" -print0)
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

# collect_targets_pr <shell-glob>
# Uses PS_PR_BASE_SHA/PS_PR_HEAD_SHA to get affected files.
collect_targets_pr() {
  local pattern="$1"
  local -a diff_files=()

  targets=()

  if [[ -z "${PS_PR_BASE_SHA:-}" || -z "${PS_PR_HEAD_SHA:-}" ]]; then
    return 1
  fi

  if ! git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null; then
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin "${PS_PR_BASE_SHA}" >/dev/null 2>&1 || true
  fi
  if ! git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin "${PS_PR_HEAD_SHA}" >/dev/null 2>&1 || true
  fi

  if git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null && \
     git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
  diff_files=()
  while IFS= read -r file; do
    diff_files+=("${file}")
  done < <(git diff --name-only "${PS_PR_BASE_SHA}" "${PS_PR_HEAD_SHA}")
  elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  diff_files=()
  while IFS= read -r file; do
    diff_files+=("${file}")
  done < <(git diff --name-only HEAD~1 HEAD)
  else
    return 1
  fi

  for f in ${diff_files[@]+"${diff_files[@]}"}; do
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern})
        targets+=("${repo_root}/${f}")
        ;;
      *)
        ;;
    esac
  done
  return 0
}

# collect_targets_staged <shell-glob>
# Example: collect_targets_staged "*.md" or collect_targets_staged "*.yml|*.yaml"
collect_targets_staged() {
  local pattern="$1"
  targets=()
  if [[ "${CI:-0}" == "1" && -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
    if collect_targets_pr "${pattern}"; then
      return 0
    fi
  fi
  staged=()
  while IFS= read -r f; do
    staged+=("${f}")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z | tr '\0' '\n')
  for f in ${staged[@]+"${staged[@]}"}; do
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern})
        targets+=("${repo_root}/${f}")
        ;;
      *)
        ;;
    esac
  done
}
