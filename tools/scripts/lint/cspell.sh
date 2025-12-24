#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — CSpell (Deterministic, correct exit codes)
# ------------------------------------------------------------------------------
# Purpose:
#   Spell-check repo text/code using cspell.
#
# Modes:
#   - Default (local): staged/changed files only (fast)
#   - CI / full scan: all relevant files when PS_FULL_SCAN=1 or CI=1
#
# Determinism:
#   - Prefer repo-local binary (node_modules/.bin/cspell)
#   - Do NOT use npx in CI
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_dot="${repo_root}/configs/lint/.cspell.json"
config_json="${repo_root}/configs/lint/cspell.json"

config_path=""
if [[ -f "${config_dot}" ]]; then
  config_path="${config_dot}"
elif [[ -f "${config_json}" ]]; then
  config_path="${config_json}"
else
  ps_error "cspell config not found (expected configs/lint/.cspell.json or configs/lint/cspell.json)"
  exit 1
fi

CSP_BIN=""
CSP_VIA_NPX=0

if [[ -x "${repo_root}/node_modules/.bin/cspell" ]]; then
  CSP_BIN="${repo_root}/node_modules/.bin/cspell"
elif command -v cspell >/dev/null 2>&1; then
  CSP_BIN="$(command -v cspell)"
elif [[ "${CI:-0}" != "1" ]] && command -v npx >/dev/null 2>&1; then
  # Local-only convenience fallback (non-deterministic): disabled in CI.
  CSP_BIN="$(command -v npx)"
  CSP_VIA_NPX=1
  ps_detail "cspell not found locally — using npx (non-deterministic). Prefer: npm ci"
else
  ps_error "cspell is required but not found (run: npm ci)"
  exit 1
fi

CSP_ARGS=("$@")

# Build targets
targets=()
if [[ "${full_scan}" == "1" ]]; then
  collect_targets_find \( \
    -name "*.md" -o -name "*.markdown" -o \
    -name "*.yml" -o -name "*.yaml" -o \
    -name "*.json" -o \
    -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o \
    -name "*.sh" -o \
    -name "Dockerfile" \
  \)
else
  collect_targets_staged "*.md|*.markdown|*.yml|*.yaml|*.json|*.js|*.ts|*.tsx|*.sh|Dockerfile"
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "CSpell: no files to check."
  exit 0
fi

# Relative paths (cspell output is nicer and config often assumes repo-root)
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
if [[ "${CSP_VIA_NPX}" -eq 1 ]]; then
  output="$(
    cd "${repo_root}" && \
    "${CSP_BIN}" --yes cspell --config "${config_path}" "${CSP_ARGS[@]}" "${relative_targets[@]}" 2>&1
  )"
else
  output="$(
    cd "${repo_root}" && \
    "${CSP_BIN}" --config "${config_path}" "${CSP_ARGS[@]}" "${relative_targets[@]}" 2>&1
  )"
fi
status=$?
set -e

# Print output (trim purely empty output)
if [[ -n "${output}" ]]; then
  printf '%s\n' "${output}"
fi

exit "${status}"
