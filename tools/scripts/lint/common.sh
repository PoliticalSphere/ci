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
    full_scan="1"
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

# collect_targets_staged <shell-glob>
# Example: collect_targets_staged "*.md" or collect_targets_staged "*.yml|*.yaml"
collect_targets_staged() {
  local pattern="$1"
  targets=()
  mapfile -t staged < <(git diff --cached --name-only --diff-filter=ACMR -z | tr '\0' '\n')
  for f in "${staged[@]}"; do
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
