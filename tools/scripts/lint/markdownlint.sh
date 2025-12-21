#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Markdownlint
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Markdown files with the platform configuration.
#
# Modes:
#   - Default (local): checks staged Markdown files only (fast)
#   - CI / full scan: checks all Markdown when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/markdownlint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/markdownlint.sh
# ==============================================================================

# Source shared lint helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

# Prefer '.markdownlint.json' (required by markdownlint-cli2), then JSON/JSONC configs. Fall back to YAML for
# documentation/compatibility with older tooling.
config_dot="${repo_root}/configs/lint/.markdownlint.json"
config_jsonc="${repo_root}/configs/lint/markdownlint-cli2.jsonc"
config_jsonc_alt="${repo_root}/configs/lint/markdownlint.jsonc"
config_json="${repo_root}/configs/lint/markdownlint.json"
config_yaml="${repo_root}/configs/lint/markdownlint.yml"

if [[ -f "${config_dot}" ]]; then
  config_path="${config_dot}"
elif [[ -f "${config_jsonc}" ]]; then
  config_path="${config_jsonc}"
elif [[ -f "${config_jsonc_alt}" ]]; then
  config_path="${config_jsonc_alt}"
elif [[ -f "${config_json}" ]]; then
  config_path="${config_json}"
elif [[ -f "${config_yaml}" ]]; then
  config_path="${config_yaml}"
else
  ps_error "markdownlint config not found (expected .markdownlint.json or markdownlint-cli2.jsonc or markdownlint.json or markdownlint.yml)"
  exit 1
fi

MDL_BIN=""
if [[ -x "${repo_root}/node_modules/.bin/markdownlint-cli2" ]]; then
  MDL_BIN="${repo_root}/node_modules/.bin/markdownlint-cli2"
elif command -v markdownlint-cli2 >/dev/null 2>&1; then
  MDL_BIN="$(command -v markdownlint-cli2)"
else
  ps_error "markdownlint-cli2 is required but not found (run: npm ci)"
  exit 1
fi

# Pass-through args safely (rare, but keeps tooling consistent).
MDL_ARGS=()
if [[ "$#" -gt 0 ]]; then
  MDL_ARGS+=("$@")
fi

# Build targets
if [[ "${full_scan}" == "1" ]]; then
  collect_targets_find -name "*.md"
else
  collect_targets_staged "*.md"
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "Markdownlint: no Markdown files to check."
  exit 0
fi

relative_targets=()
for target in "${targets[@]}"; do
  if [[ "${target}" == "${repo_root}/"* ]]; then
    relative_targets+=("${target#"${repo_root}"/}")
  else
    relative_targets+=("${target}")
  fi
done

run_markdownlint() {
  if [[ "$#" -gt 0 ]]; then
    (cd "${repo_root}" && "${MDL_BIN}" --config "${config_path}" "$@" "${relative_targets[@]}")
  else
    (cd "${repo_root}" && "${MDL_BIN}" --config "${config_path}" "${relative_targets[@]}")
  fi
}

# Filter noise so output shows only actionable lint issues.
output="$(run_markdownlint "$@" 2>&1)"
status=$?
if [[ -n "${output}" ]]; then
  echo "${output}" | grep -Ev '^(markdownlint-cli2|Finding:|Linting:|Summary:)' || true
fi
exit "${status}"
