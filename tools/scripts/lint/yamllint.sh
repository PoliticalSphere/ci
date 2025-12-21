#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Yamllint
# ------------------------------------------------------------------------------
# Purpose:
#   Validate YAML files with the platform configuration.
#
# Modes:
#   - Default (local): checks staged YAML files only (fast)
#   - CI / full scan: checks all YAML files when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/yamllint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/yamllint.sh
# ==============================================================================

# Source shared lint helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/configs/lint/yamllint.yml"
if [[ ! -f "${config_path}" ]]; then
  ps_error "yamllint config not found at ${config_path}"
  exit 1
fi

if ! command -v yamllint >/dev/null 2>&1; then
  ps_error "yamllint is required but not found on PATH"
  ps_detail_err "HINT: install yamllint (e.g. pipx install yamllint) or provide it via your tooling image."
  exit 1
fi

# Pass-through args safely (rare, but keeps tooling consistent).
YAMLLINT_ARGS=()
if [[ "$#" -gt 0 ]]; then
  YAMLLINT_ARGS+=("$@")
fi

# Build targets
if [[ "${full_scan}" == "1" ]]; then
  collect_targets_find -name "*.yml" -o -name "*.yaml"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Yamllint: no YAML files found."
    exit 0
  fi
else
  collect_targets_staged "*.yml|*.yaml"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Yamllint: no staged YAML files to check."
    exit 0
  fi
fi

if [[ "${#YAMLLINT_ARGS[@]}" -gt 0 ]]; then
  yamllint -c "${config_path}" "${YAMLLINT_ARGS[@]}" "${targets[@]}"
else
  yamllint -c "${config_path}" "${targets[@]}"
fi
