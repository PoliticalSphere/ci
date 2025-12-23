#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — CSpell (code spell checker)
# ------------------------------------------------------------------------------
# Purpose:
#   Validate spelling of repository text (docs, comments, source) using cspell.
#
# Modes:
#   - Default (local): checks staged/changed files only (fast)
#   - CI / full scan: checks all relevant files when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/cspell.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/cspell.sh
# ============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

# Locate cspell config (prefer .cspell.json)
config_dot="${repo_root}/configs/lint/.cspell.json"
config_json="${repo_root}/configs/lint/cspell.json"

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
elif command -v npx >/dev/null 2>&1; then
  # Fallback: use npx to run cspell for ad-hoc/local runs when deps are not installed.
  # Note: npx may fetch a package from the registry if not present locally.
  CSP_BIN="$(command -v npx)"
  CSP_VIA_NPX=1
  ps_detail "cspell not found locally — will attempt to run via npx (consider running: npm ci)"
else
  ps_error "cspell is required but not found (run: npm ci)"
  exit 1
fi

CSP_ARGS=()
if [[ "$#" -gt 0 ]]; then
  CSP_ARGS+=("$@")
fi

# Build targets: common text/code files (md, yml, json, js, ts, sh, Dockerfile, etc.)
if [[ "${full_scan}" == "1" ]]; then
  collect_targets_find \( -name "*.md" -o -name "*.markdown" -o -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.sh" -o -name "Dockerfile" \)
else
  # Prefer affected/staged files
  collect_targets_staged "*.md|*.markdown|*.yml|*.yaml|*.json|*.js|*.ts|*.tsx|*.sh|Dockerfile"
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "CSpell: no files to check."
  exit 0
fi

relative_targets=()
for target in "${targets[@]}"; do
  if [[ "${target}" == "${repo_root}/"* ]]; then
    relative_targets+=("${target#"${repo_root}/"}")
  else
    relative_targets+=("${target}")
  fi
done

run_cspell() {
  # Build args safely to avoid unbound-variable errors when CSP_ARGS is empty/unset
  local args=()
  if [[ "${#CSP_ARGS[@]:-0}" -gt 0 ]]; then
    args+=("${CSP_ARGS[@]}")
  fi
  args+=("${relative_targets[@]}")

  if [[ "${CSP_VIA_NPX}" -eq 1 ]]; then
    # Use npx to run cspell (allow on-demand download for local ad-hoc runs)
    (cd "${repo_root}" && "${CSP_BIN}" --yes cspell --config "${config_path}" "${args[@]}")
  else
    (cd "${repo_root}" && "${CSP_BIN}" --config "${config_path}" "${args[@]}")
  fi
}

output="$(run_cspell 2>&1)" || true
status=$?
if [[ -n "${output}" ]]; then
  # Filter out benign lines
  filtered="$(echo "${output}" | grep -Ev '^\s*$' || true)"
  if [[ -n "${filtered}" ]]; then
    printf '%s\n' "${filtered}"
  fi
fi
exit ${status}
