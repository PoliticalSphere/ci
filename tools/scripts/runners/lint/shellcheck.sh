#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — ShellCheck
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/lint/shellcheck.sh
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
# Run ShellCheck for shell script safety and correctness checks.
#
# Modes:
#   - Fast local (pre-commit): staged shell scripts only
#   - PR mode: affected shell scripts only
#   - Full scan: PS_FULL_SCAN=1 (or CI without PR context)
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/lint/shellcheck.sh
#   PS_FULL_SCAN=1 bash tools/scripts/runners/lint/shellcheck.sh
#
# ==============================================================================

# -----------------------------------------------------------------------------
# Bootstrap: Load runner abstraction
# -----------------------------------------------------------------------------
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_script_dir}/../../core/runner-base.sh"

# -----------------------------------------------------------------------------
# Runner Configuration
# -----------------------------------------------------------------------------
readonly SHELLCHECK_ID="lint.shellcheck"
readonly SHELLCHECK_TITLE="SHELLCHECK"
readonly SHELLCHECK_DESC="Shell script safety checks"
readonly SHELLCHECK_CONFIG="configs/lint/shellcheckrc"

# -----------------------------------------------------------------------------
# Shell Script Detection Helper
# -----------------------------------------------------------------------------
_is_shell_script() {
  local p="$1"

  # Check extension first
  [[ "${p}" == *.sh ]] && return 0

  # Check shebang for extensionless files
  if [[ -f "${p}" ]]; then
    local first_line
    first_line="$(head -n 1 "${p}" 2>/dev/null || true)"
    case "${first_line}" in
      '#!'*'env sh'*|'#!'*'env bash'*|'#!'*'/sh'*|'#!'*'bash'*)
        return 0
        ;;
    esac
  fi

  return 1
}

# -----------------------------------------------------------------------------
# Custom Target Collection for Shell Scripts
# -----------------------------------------------------------------------------
_collect_shell_targets() {
  RUNNER_TARGETS=()
  
  case "${RUNNER_MODE}" in
    full)
      while IFS= read -r -d '' f; do
        runner_is_excluded_path "${f}" && continue
        _is_shell_script "${f}" && RUNNER_TARGETS+=("${f}")
      done < <(find "${PS_REPO_ROOT}" -type f -print0 2>/dev/null || true)
      ;;
    pr)
      local base_sha="${PS_PR_BASE_SHA:-}"
      local head_sha="${PS_PR_HEAD_SHA:-}"
      
      if [[ -n "${base_sha}" && -n "${head_sha}" ]]; then
        while IFS= read -r f; do
          [[ -z "${f}" ]] && continue
          local full_path="${PS_REPO_ROOT}/${f}"
          [[ -f "${full_path}" ]] || continue
          runner_is_excluded_path "${full_path}" && continue
          _is_shell_script "${full_path}" && RUNNER_TARGETS+=("${full_path}")
        done < <(git diff --name-only "${base_sha}" "${head_sha}" 2>/dev/null || true)
      fi
      ;;
    staged)
      while IFS= read -r -d '' rel; do
        local full_path="${PS_REPO_ROOT}/${rel}"
        [[ -f "${full_path}" ]] || continue
        # Skip git hooks
        case "${rel}" in
          .git/hooks/*) continue ;;
        esac
        runner_is_excluded_path "${full_path}" && continue
        _is_shell_script "${full_path}" && RUNNER_TARGETS+=("${full_path}")
      done < <(git diff --cached --name-only --diff-filter=ACMR -z 2>/dev/null || true)
      ;;
  esac
  
  RUNNER_TARGET_COUNT="${#RUNNER_TARGETS[@]}"
  return 0
}

# -----------------------------------------------------------------------------
# Initialize Runner
# -----------------------------------------------------------------------------
runner_init "${SHELLCHECK_ID}" "${SHELLCHECK_TITLE}" "${SHELLCHECK_DESC}"

# Require configuration
runner_require_config "${SHELLCHECK_CONFIG}" "shellcheck config"

# Require tool (global only - shellcheck is typically installed system-wide)
runner_require_tool "shellcheck" "" "1"

# Parse pass-through arguments
runner_parse_args "$@"

# -----------------------------------------------------------------------------
# Collect Shell Script Targets
# -----------------------------------------------------------------------------
_collect_shell_targets

# Skip if no targets
if runner_skip_if_no_targets "No shell scripts to check"; then
  exit 0
fi

# -----------------------------------------------------------------------------
# Execute ShellCheck
# -----------------------------------------------------------------------------
# Build command arguments
declare -a cmd_args=("-x" "--rcfile" "${RUNNER_CONFIG}")

# Add pass-through args if any
if [[ "${#RUNNER_ARGS[@]:-0}" -gt 0 ]]; then
  cmd_args+=("${RUNNER_ARGS[@]}")
fi

# Add targets
cmd_args+=("${RUNNER_TARGETS[@]}")

# Execute
runner_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
