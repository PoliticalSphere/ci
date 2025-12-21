#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Biome Lint
# ------------------------------------------------------------------------------
# Purpose:
#   Run Biome formatting + lint checks with the platform configuration.
#
# Modes:
#   - Default (local): checks staged files only (fast)
#   - CI / full scan: checks the whole repo when PS_FULL_SCAN=1
#
# Usage:
#   bash tools/scripts/lint/biome.sh
#   bash tools/scripts/lint/biome.sh --write
#   PS_FULL_SCAN=1 bash tools/scripts/lint/biome.sh
# ==============================================================================

# Source shared lint helpers
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/biome.json"
if [[ ! -f "${config_path}" ]]; then
  ps_error "Biome config not found at ${config_path}"
  exit 1
fi

# Prefer the project-local biome (deterministic). Fall back to PATH only if needed.
BIOME_BIN=""
if [[ -x "${repo_root}/node_modules/.bin/biome" ]]; then
  BIOME_BIN="${repo_root}/node_modules/.bin/biome"
elif command -v biome >/dev/null 2>&1; then
  BIOME_BIN="$(command -v biome)"
else
  ps_error "biome is required but not found (run: npm ci)"
  exit 1
fi

# Pass-through args (e.g. --write) safely.
BIOME_ARGS=()
if [[ "$#" -gt 0 ]]; then
  BIOME_ARGS+=("$@")
fi

# Determine target files:
# - Full repo when PS_FULL_SCAN=1 or CI=1
# - Otherwise: staged files only (fast pre-commit behaviour)

targets=()

if [[ "${full_scan}" == "1" ]]; then
  targets=("${repo_root}")
else
  collect_targets_staged "*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json|*.jsonc"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Biome: no staged JS/TS/JSON files to check."
    exit 0
  fi
fi

if [[ "${#BIOME_ARGS[@]}" -gt 0 ]]; then
  "${BIOME_BIN}" check --config-path "${config_path}" "${BIOME_ARGS[@]}" "${targets[@]}"
else
  "${BIOME_BIN}" check --config-path "${config_path}" "${targets[@]}"
fi
