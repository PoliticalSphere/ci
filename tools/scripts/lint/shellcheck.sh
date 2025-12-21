#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — ShellCheck
# ------------------------------------------------------------------------------
# Purpose:
#   Validate shell scripts with the platform configuration.
#
# Modes:
#   - Default (local): checks staged shell scripts only (fast)
#   - CI / full scan: checks all shell scripts when PS_FULL_SCAN=1 or CI=1
#
# Notes:
#   - Includes *.sh and executable scripts with a bash/sh shebang.
#   - Uses --rcfile to keep ShellCheck behaviour deterministic.
# ==============================================================================

# Source shared lint helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/configs/lint/shellcheckrc"
if [[ ! -f "${config_path}" ]]; then
  ps_error "shellcheck config not found at ${config_path}"
  exit 1
fi

if ! command -v shellcheck >/dev/null 2>&1; then
  ps_error "shellcheck is required but not found on PATH"
  ps_detail_err "HINT: install shellcheck or provide it via your tooling image."
  exit 1
fi

# Pass-through args safely (rare, but keeps tooling consistent).
SHELLCHECK_ARGS=()
if [[ "$#" -gt 0 ]]; then
  SHELLCHECK_ARGS+=("$@")
fi

targets=()

is_shell_script() {
  local p="$1"

  # Common extension
  if [[ "${p}" == *.sh ]]; then
    return 0
  fi

  # Shebang detection for extensionless scripts (best-effort, safe).
  if [[ -f "${p}" ]]; then
    local first_line
    first_line="$(head -n 1 "${p}" 2>/dev/null || true)"
    case "${first_line}" in
      '#!'*'env sh'*|'#!'*'env bash'*|'#!'*'/sh'*|'#!'*'bash'*)
        return 0
        ;;
      *)
        ;;
    esac
  fi

  return 1
}

if [[ "${full_scan}" == "1" ]]; then
  # Exclude common non-source dirs to reduce noise and cost.
  while IFS= read -r -d '' f; do
    if is_shell_script "${f}"; then
      targets+=("${f}")
    fi
  done < <(
    find "${repo_root}" -type f \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -not -path "*/build/*" \
      -not -path "*/coverage/*" \
      -not -path "*/reports/*" \
      -print0
  )
else
  mapfile -t staged < <(git diff --cached --name-only --diff-filter=ACMR -z | tr '\0' '\n')
  for f in "${staged[@]}"; do
    full_path="${repo_root}/${f}"
    if is_shell_script "${full_path}"; then
      targets+=("${full_path}")
    fi
  done
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "ShellCheck: no shell scripts to check."
  exit 0
fi

# Use --external-sources (-x) to allow shellcheck to follow sourced helper files
# (helps reduce false-positive SC1091/SC2154 warnings in CI where helpers are resolvable)
if [[ "$#" -gt 0 ]]; then
  shellcheck -x --rcfile "${config_path}" "$@" "${targets[@]}"
else
  shellcheck -x --rcfile "${config_path}" "${targets[@]}"
fi
