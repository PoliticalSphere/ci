#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Yamllint (Deterministic)
# ------------------------------------------------------------------------------
# Purpose:
#   Validate YAML files with the platform configuration.
#
# Modes:
#   - Default (local): staged YAML files only (fast)
#   - CI / full scan: all YAML files when PS_FULL_SCAN=1 or CI=1
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/runners/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag
PS_LOG_COMPONENT="lint.yamllint"
lint_log_init "lint.yamllint" "YAMLLINT" "YAML validity and formatting" "$(lint_log_mode)"

config_path="${repo_root}/configs/lint/yamllint.yml"
if [[ ! -f "${config_path}" ]]; then
  lint_log_set_status "ERROR"
  ps_error "yamllint config not found: ${config_path}"
  exit 1
fi

YAMLLINT_BIN="${YAMLLINT_BIN:-yamllint}"
if ! command -v "${YAMLLINT_BIN}" >/dev/null 2>&1; then
  lint_log_set_status "ERROR"
  ps_error "yamllint is required but not found on PATH"
  ps_detail_err "HINT: install yamllint (e.g. pipx install yamllint) or provide it via your tooling image."
  exit 1
fi

YAMLLINT_ARGS=()
if [[ "$#" -gt 0 ]]; then
  YAMLLINT_ARGS=("$@")
fi

# Build targets
targets=()
if [[ "${full_scan}" == "1" ]]; then
  # Correctly grouped OR expression
  collect_targets_find \( -name "*.yml" -o -name "*.yaml" \)
  if [[ "${#targets[@]}" -eq 0 ]]; then
    lint_log_set_targets 0
    lint_log_set_status "SKIPPED"
    ps_detail "Yamllint: no YAML files found."
    exit 0
  fi
else
  collect_targets_staged "*.yml|*.yaml"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    lint_log_set_targets 0
    lint_log_set_status "SKIPPED"
    ps_detail "Yamllint: no staged YAML files to check."
    exit 0
  fi
fi
lint_log_set_targets "${#targets[@]}"

if [[ "${#YAMLLINT_ARGS[@]}" -gt 0 ]]; then
  "${YAMLLINT_BIN}" -c "${config_path}" "${YAMLLINT_ARGS[@]}" "${targets[@]}"
else
  "${YAMLLINT_BIN}" -c "${config_path}" "${targets[@]}"
fi
