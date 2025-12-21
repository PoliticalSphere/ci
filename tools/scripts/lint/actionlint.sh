#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Actionlint
# ------------------------------------------------------------------------------
# Purpose:
#   Validate GitHub Actions workflows using actionlint.
#
# Modes:
#   - Default (local): checks staged workflow files only (fast)
#   - CI / full scan: checks all workflows when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/actionlint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/actionlint.sh
# ==============================================================================

# Source shared lint helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

cd "${repo_root}"

config_path="${repo_root}/configs/lint/actionlint.yml"
if [[ ! -f "${config_path}" ]]; then
  ps_error "actionlint config not found at ${config_path}"
  exit 1
fi

if ! command -v actionlint >/dev/null 2>&1; then
  ps_error "actionlint is required but not found on PATH"
  ps_detail_err "HINT: install actionlint (e.g. via your tooling image or local package manager)."
  exit 1
fi

# Pass-through args safely (rare, but keeps tooling consistent).
ACTIONLINT_ARGS=()
if [[ "$#" -gt 0 ]]; then
  ACTIONLINT_ARGS+=("$@")
fi

targets=()

if [[ "${full_scan}" == "1" ]]; then
  if [[ -d "${repo_root}/.github/workflows" ]]; then
    while IFS= read -r -d '' f; do
      targets+=("${f}")
    done < <(find "${repo_root}/.github/workflows" -type f \( -name "*.yml" -o -name "*.yaml" \) -print0)
  fi
else
  mapfile -t staged < <(git diff --cached --name-only --diff-filter=ACMR -z | tr '\0' '\n')
  for f in "${staged[@]}"; do
    case "${f}" in
      .github/workflows/*.yml|.github/workflows/*.yaml)
        targets+=("${repo_root}/${f}")
        ;;
      *)
        ;;
    esac
  done
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "Actionlint: no workflow files to check."
  exit 0
fi

if [[ "$#" -gt 0 ]]; then
  actionlint -config-file "${config_path}" "$@" "${targets[@]}"
else
  actionlint -config-file "${config_path}" "${targets[@]}"
fi
