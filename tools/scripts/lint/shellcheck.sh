#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — ShellCheck (Deterministic, nounset-safe)
# ------------------------------------------------------------------------------
# Modes:
#   - Default (local): staged shell scripts only
#   - CI / full scan: all shell scripts when PS_FULL_SCAN=1 or CI=1
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag
PS_LOG_COMPONENT="lint.shellcheck"
lint_log_init "lint.shellcheck" "SHELLCHECK" "Shell script safety checks" "$(lint_log_mode)"

config_path="${repo_root}/configs/lint/shellcheckrc"
if [[ ! -f "${config_path}" ]]; then
  lint_log_set_status "ERROR"
  ps_error "shellcheck config not found: ${config_path}"
  exit 1
fi

SHELLCHECK_BIN="${SHELLCHECK_BIN:-shellcheck}"
if ! command -v "${SHELLCHECK_BIN}" >/dev/null 2>&1; then
  lint_log_set_status "ERROR"
  ps_error "shellcheck is required but not found on PATH"
  ps_detail_err "HINT: install shellcheck or provide it via your tooling image."
  exit 1
fi

SHELLCHECK_ARGS=()
if [[ "$#" -gt 0 ]]; then
  SHELLCHECK_ARGS=("$@")
fi

is_shell_script() {
  local p="$1"

  [[ "${p}" == *.sh ]] && return 0

  if [[ -f "${p}" ]]; then
    local first_line
    first_line="$(head -n 1 "${p}" 2>/dev/null || true)"
    case "${first_line}" in
      '#!'*'env sh'*|'#!'*'env bash'*|'#!'*'/sh'*|'#!'*'bash'*)
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  fi

  return 1
}

# Always-set array
declare -a files=()

if [[ "${full_scan}" == "1" ]]; then
  while IFS= read -r -d '' f; do
    case "${f}" in
      */node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/reports/*|*/.git/hooks/*)
        continue
        ;;
      *)
        ;; # default: do nothing
    esac
    if is_shell_script "${f}"; then
      files+=("${f}")
    fi
  done < <(find "${repo_root}" -type f -print0)

else
  if [[ "${has_git:-0}" != "1" ]]; then
    lint_log_set_targets 0
    lint_log_set_status "SKIPPED"
    ps_detail "ShellCheck: git not available; nothing to check in staged mode."
    exit 0
  fi

  while IFS= read -r -d '' rel; do
    local_path="${repo_root}/${rel}"
    [[ -f "${local_path}" ]] || continue
    case "${rel}" in
      .git/hooks/*) continue ;;
      *) ;; # default: do nothing
    esac
    if is_shell_script "${local_path}"; then
      files+=("${local_path}")
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR -z)
fi

if [[ "${#files[@]}" -eq 0 ]]; then
  lint_log_set_targets 0
  lint_log_set_status "SKIPPED"
  ps_detail "ShellCheck: no shell scripts to check."
  exit 0
fi
lint_log_set_targets "${#files[@]}"

if [[ "${#SHELLCHECK_ARGS[@]}" -gt 0 ]]; then
  "${SHELLCHECK_BIN}" -x --rcfile "${config_path}" "${SHELLCHECK_ARGS[@]}" "${files[@]}"
else
  "${SHELLCHECK_BIN}" -x --rcfile "${config_path}" "${files[@]}"
fi
