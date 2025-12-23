#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Knip (unused dependency checker)
# ------------------------------------------------------------------------------
# Purpose:
#   Detect unused or missing dependencies using knip.
#
# Modes:
#   - Default (local): runs only when package files changed (fast)
#   - CI / full scan: runs across the repo when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/knip.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/knip.sh
# ============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

# If not full-scan, only run when package files changed
if [[ "${full_scan}" != "1" ]]; then
  collect_targets_staged "package.json|package-lock.json|yarn.lock|pnpm-lock.yaml"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    echo "Knip: no staged package files to check."
    exit 0
  fi
fi

KNIP_BIN=""
KNIP_VIA_NPX=0
if [[ -x "${repo_root}/node_modules/.bin/knip" ]]; then
  KNIP_BIN="${repo_root}/node_modules/.bin/knip"
elif command -v knip >/dev/null 2>&1; then
  KNIP_BIN="$(command -v knip)"
elif command -v npx >/dev/null 2>&1; then
  KNIP_BIN="$(command -v npx)"
  KNIP_VIA_NPX=1
  ps_detail "knip not found locally — will attempt to run via npx (consider running: npm ci)"
else
  ps_error "knip is required but not found (run: npm ci)"
  exit 1
fi

KNIP_ARGS=(--reporter compact "${repo_root}")

run_knip() {
  if [[ "${KNIP_VIA_NPX}" -eq 1 ]]; then
    (cd "${repo_root}" && "${KNIP_BIN}" --yes knip "${KNIP_ARGS[@]}")
  else
    (cd "${repo_root}" && "${KNIP_BIN}" "${KNIP_ARGS[@]}")
  fi
}

output="$(run_knip 2>&1)" || true
status=$?
if [[ -n "${output}" ]]; then
  # Filter empty lines
  filtered="$(echo "${output}" | grep -Ev '^\s*$' || true)"
  if [[ -n "${filtered}" ]]; then
    echo "${filtered}"
  fi
fi
exit ${status}
