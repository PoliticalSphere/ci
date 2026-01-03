#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Knip (unused dependency checker)
# ------------------------------------------------------------------------------
# Purpose:
#   Detect unused or missing dependencies using knip.
#
# Modes:
#   - Default (local): runs only when package/lock files changed (fast)
#   - CI / full scan: runs across the repo when PS_FULL_SCAN=1 or CI=1
#
# Determinism:
#   - Prefer repo-local binary (node_modules/.bin/knip)
#   - Do NOT use npx in CI
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/runners/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag
PS_LOG_COMPONENT="lint.knip"
lint_log_init "lint.knip" "KNIP" "Dependency audit (knip)" "$(lint_log_mode)"

# Fast mode: only run when dependency manifests/lockfiles changed.
if [[ "${full_scan}" != "1" ]]; then
  targets=()
  collect_targets_staged "package.json|package-lock.json|npm-shrinkwrap.json|yarn.lock|pnpm-lock.yaml"
  if [[ "${#targets[@]}" -eq 0 ]]; then
    lint_log_set_targets 0
    lint_log_set_status "SKIPPED"
    ps_detail "Knip: no staged package/lock files changed — skipping."
    exit 0
  fi
  lint_log_set_targets "${#targets[@]}"
fi

KNIP_BIN="${KNIP_BIN:-}"
KNIP_VIA_NPX=0

if [[ -n "${KNIP_BIN}" ]]; then
  : # user override
elif [[ -x "${repo_root}/node_modules/.bin/knip" ]]; then
  KNIP_BIN="${repo_root}/node_modules/.bin/knip"
elif command -v knip >/dev/null 2>&1; then
  KNIP_BIN="$(command -v knip)"
elif [[ "${CI:-0}" != "1" ]] && command -v npx >/dev/null 2>&1; then
  KNIP_BIN="$(command -v npx)"
  KNIP_VIA_NPX=1
  ps_detail "knip not found locally — using npx (non-deterministic). Prefer: npm ci"
else
  lint_log_set_status "ERROR"
  ps_error "knip is required but not found (run: npm ci)"
  exit 1
fi

# Knip invocation
# - reporter compact for stable output
# - run from repo root; avoid passing '.' (newer knip rejects positional args)
declare -a KNIP_ARGS=(--reporter compact)

output=""
status=0
set +e
if [[ "${KNIP_VIA_NPX}" -eq 1 ]]; then
  output="$(cd "${repo_root}" && "${KNIP_BIN}" --yes knip "${KNIP_ARGS[@]}" 2>&1)"
else
  output="$(cd "${repo_root}" && "${KNIP_BIN}" "${KNIP_ARGS[@]}" 2>&1)"
fi
status=$?
set -e

if [[ -n "${output}" ]]; then
  # Trim purely empty lines; keep everything else (findings are actionable)
  filtered="$(printf '%s\n' "${output}" | grep -Ev '^[[:space:]]*$' || true)"
  if [[ -n "${filtered}" ]]; then
    printf '%s\n' "${filtered}"
  fi
fi

exit "${status}"
