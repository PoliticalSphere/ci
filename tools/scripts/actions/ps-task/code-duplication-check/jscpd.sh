#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — JSCPD
# ------------------------------------------------------------------------------
# Purpose:
#   Detect code duplication using the platform configuration.
#
# Modes:
#   - Default (local): checks staged relevant files only
#   - CI / full scan: checks the whole repo when PS_FULL_SCAN=1 or CI=1
#   - CI PR (affected): checks PR diff files when PS_PR_BASE_SHA/PS_PR_HEAD_SHA set
#
# Notes:
#   - Report outputs are configured in configs/lint/jscpd.json.
#   - This script is a deterministic runner; selection logic is shared helpers.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Common script helpers (formatting, repo_root, retry_cmd)
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

# Reuse target selection helpers (PR diff / staged / full scan decision)
lint_common="${repo_root}/tools/scripts/runners/lint/common.sh"
if [[ -f "${lint_common}" ]]; then
  # shellcheck source=tools/scripts/runners/lint/common.sh
  . "${lint_common}"
else
  error "lint common helpers not found at ${lint_common}"
  exit 1
fi

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/configs/lint/jscpd.json"
if [[ ! -f "${config_path}" ]]; then
  error "jscpd config not found at ${config_path}"
  exit 1
fi

JSCPD_BIN=""
if [[ -x "${repo_root}/node_modules/.bin/jscpd" ]]; then
  JSCPD_BIN="${repo_root}/node_modules/.bin/jscpd"
elif command -v jscpd >/dev/null 2>&1; then
  JSCPD_BIN="$(command -v jscpd)"
else
  error "jscpd is required but not found (run: npm ci)"
  exit 1
fi

# Pass-through args safely.
JSCPD_ARGS=()
if [[ "$#" -gt 0 ]]; then
  JSCPD_ARGS+=("$@")
fi

if [[ -n "${JSCPD_THRESHOLD:-}" ]]; then
  JSCPD_ARGS+=(--threshold "${JSCPD_THRESHOLD}")
  detail "JSCPD: threshold override ${JSCPD_THRESHOLD}."
fi

# Files eligible for duplication scanning (keep to code-ish formats by default).
# Add *.md/*.yml/*.yaml if you intentionally want docs/config duplication detection.
pattern="*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json|*.sh"

targets=()

# If no git, duplication scan must be full scan.
if [[ "${has_git:-0}" != "1" ]]; then
  detail "JSCPD: not a git repository — performing full scan."
  full_scan="1"
fi

if [[ "${CI:-0}" == "1" && -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
  if collect_targets_pr "${pattern}"; then
    : # targets populated
  else
    detail "JSCPD: unable to resolve PR base/head; falling back to staged or full scan."
    if [[ "${full_scan}" == "1" ]]; then
      targets=("${repo_root}")
    else
      collect_targets_staged "${pattern}" || true
    fi
  fi
elif [[ "${full_scan}" == "1" ]]; then
  targets=("${repo_root}")
else
  collect_targets_staged "${pattern}" || true
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  detail "JSCPD: no eligible files to scan."
  exit 0
fi

# Run from repo root for stable paths in reports/logs.
cd "${repo_root}"

# Helpful context on what we scanned (without spamming logs).
detail "JSCPD: scanning ${#targets[@]} target(s)."

set +e
if [[ "${#JSCPD_ARGS[@]}" -gt 0 ]]; then
  "${JSCPD_BIN}" --config "${config_path}" "${JSCPD_ARGS[@]}" "${targets[@]}"
else
  "${JSCPD_BIN}" --config "${config_path}" "${targets[@]}"
fi
rc=$?
set -e

if [[ "${rc}" -ne 0 ]]; then
  if [[ "${PS_STRICT_MAINTAINABILITY:-1}" == "1" ]]; then
    exit "${rc}"
  fi
  detail "JSCPD: advisory mode enabled (PS_STRICT_MAINTAINABILITY=0); exiting 0."
  exit 0
fi
