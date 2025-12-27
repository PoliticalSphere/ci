#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Markdownlint (Correct exit codes, low-noise output)
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Markdown files with markdownlint-cli2 using repo config.
#
# Modes:
#   - Default (local): staged Markdown files only (fast)
#   - CI / full scan: checks all Markdown when PS_FULL_SCAN=1 or CI=1
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

# Prefer '.markdownlint.json' (markdownlint-cli2), then jsonc/json/yml fallbacks.
config_dot="${repo_root}/configs/lint/.markdownlint.json"
config_jsonc="${repo_root}/configs/lint/markdownlint-cli2.jsonc"
config_jsonc_alt="${repo_root}/configs/lint/markdownlint.jsonc"
config_json="${repo_root}/configs/lint/markdownlint.json"
config_yaml="${repo_root}/configs/lint/markdownlint.yml"

config_path=""
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
  ps_error "markdownlint config not found (expected .markdownlint.json / markdownlint-cli2.jsonc / markdownlint.json[c] / markdownlint.yml)"
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

MDL_ARGS=()
if [[ "$#" -gt 0 ]]; then
  MDL_ARGS=("$@")
fi

# Build targets
targets=()
if [[ "${full_scan}" == "1" ]]; then
  collect_targets_find -name "*.md"
else
  collect_targets_staged "*.md"
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "Markdownlint: no Markdown files to check."
  exit 0
fi

# markdownlint-cli2 works best from repo root with relative paths
declare -a relative_targets=()
for target in "${targets[@]}"; do
  if [[ "${target}" == "${repo_root}/"* ]]; then
    relative_targets+=("${target#${repo_root}/}")
  else
    relative_targets+=("${target}")
  fi
done

# Run and capture output + exit code reliably
output=""
status=0
set +e
if [[ "${#MDL_ARGS[@]}" -gt 0 ]]; then
  output="$(
    cd "${repo_root}" && \
    "${MDL_BIN}" --config "${config_path}" "${MDL_ARGS[@]}" "${relative_targets[@]}" 2>&1
  )"
else
  output="$(
    cd "${repo_root}" && \
    "${MDL_BIN}" --config "${config_path}" "${relative_targets[@]}" 2>&1
  )"
fi
status=$?
set -e

# Filter noise so output shows only actionable lint issues.
if [[ -n "${output}" ]]; then
  filtered="$(printf '%s\n' "${output}" | grep -Ev '^(markdownlint-cli2|Finding:|Linting:|Summary:)' || true)"
  if [[ -n "${filtered}" ]]; then
    printf '%s\n' "${filtered}"
  elif [[ "${status}" -ne 0 ]]; then
    # If it failed but we filtered everything, show the original output.
    printf '%s\n' "${output}"
  fi
fi

exit "${status}"
