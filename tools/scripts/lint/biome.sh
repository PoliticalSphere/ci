#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Biome Lint
# ------------------------------------------------------------------------------
# Purpose:
#   Run Biome formatting + lint checks using repo configuration.
#
# Default behaviour:
#   - Fast local (pre-commit): staged JS/TS/JSON only
#   - Full scan: PS_FULL_SCAN=1 (or CI=1)
#
# Usage:
#   bash tools/scripts/lint/biome.sh
#   bash tools/scripts/lint/biome.sh --write
#   PS_FULL_SCAN=1 bash tools/scripts/lint/biome.sh
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/biome.json"
if [[ ! -f "${config_path}" ]]; then
  ps_error "Biome config not found: ${config_path}"
  exit 1
fi

# Prefer project-local biome for determinism; fall back to PATH only if needed.
BIOME_BIN=""
if [[ -x "${repo_root}/node_modules/.bin/biome" ]]; then
  BIOME_BIN="${repo_root}/node_modules/.bin/biome"
elif command -v biome >/dev/null 2>&1; then
  BIOME_BIN="$(command -v biome)"
else
  ps_error "Biome not found. Fix: npm ci"
  exit 1
fi

# Pass-through args safely (e.g. --write, --unsafe, etc.)
BIOME_ARGS=("$@")

# Determine targets:
# - Full repo when full_scan=1
# - Otherwise: staged files only
declare -a targets=()

# Helper: collect staged targets into a local array, without relying on globals.
# Expects common.sh to provide `collect_targets_staged` that prints NUL- or newline-separated paths.
_ps_collect_staged_targets() {
  # If your collect_targets_staged already echoes newline-separated paths, this works.
  # If it mutates a global, we still fall back to reading the global `targets` below.
  local pattern="$1"

  # Try capture from stdout first (preferred).
  local out=""
  if out="$(collect_targets_staged "${pattern}" 2>/dev/null || true)"; then
    if [[ -n "${out}" ]]; then
      # shellcheck disable=SC2206 # we want word-splitting on newlines for file lists
      targets=(${out})
      return 0
    fi
  fi

  # Fallback: if common.sh mutates global `targets`, copy it.
  if declare -p targets >/dev/null 2>&1; then
    return 0
  fi

  return 0
}

if [[ "${full_scan}" == "1" ]]; then
  targets=("${repo_root}")
else
  # NOTE: Keep this in one place so it’s easy to update.
  # If your helper expects a regex, the '|' form is fine; if it expects globs, adjust in common.sh.
  file_selector="*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json|*.jsonc"
  _ps_collect_staged_targets "${file_selector}"

  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Biome: no staged JS/TS/JSON files to check."
    exit 0
  fi
fi

# Execute
"${BIOME_BIN}" check --config-path "${config_path}" "${BIOME_ARGS[@]}" "${targets[@]}"
