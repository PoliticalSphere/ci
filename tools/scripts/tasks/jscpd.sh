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
#
# Notes:
#   - Report outputs are configured in configs/lint/jscpd.json.
#   - This script is a thin deterministic runner (no duplicated policy here).
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

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

# Pass-through args safely (rare, but keeps tooling consistent).
JSCPD_ARGS=()
if [[ "$#" -gt 0 ]]; then
  JSCPD_ARGS+=("$@")
fi

full_scan="${PS_FULL_SCAN:-0}"

# If this environment is not a git repository, do a full scan — staged checks rely on Git.
# This avoids printing Git help text (e.g. when running in CI or in a workspace without .git).
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  detail "JSCPD: not a git repository — performing full scan."
  full_scan="1"
fi

targets=()

if [[ "${CI:-0}" == "1" && -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
  if ! git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null; then
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin "${PS_PR_BASE_SHA}" >/dev/null 2>&1 || true
  fi
  if ! git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin "${PS_PR_HEAD_SHA}" >/dev/null 2>&1 || true
  fi

  if git cat-file -e "${PS_PR_BASE_SHA}^{commit}" 2>/dev/null && \
     git cat-file -e "${PS_PR_HEAD_SHA}^{commit}" 2>/dev/null; then
    mapfile -t diff_files < <(git diff --name-only "${PS_PR_BASE_SHA}" "${PS_PR_HEAD_SHA}")
  else
    detail "JSCPD: unable to resolve PR base/head; falling back to HEAD~1."
    if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      mapfile -t diff_files < <(git diff --name-only HEAD~1 HEAD)
    else
      detail "JSCPD: no prior commit available for diff."
      exit 0
    fi
  fi

  for f in ${diff_files[@]+"${diff_files[@]}"}; do
    case "${f}" in
      *.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json|*.yml|*.yaml|*.md|*.sh)
        targets+=("${repo_root}/${f}")
        ;;
      *)
        ;;
    esac
  done

  if [[ "${#targets[@]}" -eq 0 ]]; then
    detail "JSCPD: no PR files eligible for duplication scan."
    exit 0
  fi
elif [[ "${full_scan}" == "1" ]]; then
  # Full scan: run against repo root (jscpd will respect ignore patterns).
  targets=("${repo_root}")
else
  # Staged files only (fast-ish) — filter to common text/code formats.
  staged=()
  while IFS= read -r f; do
    staged+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z | tr '\0' '\n')
  for f in ${staged[@]+"${staged[@]}"}; do
    case "${f}" in
      *.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json|*.yml|*.yaml|*.md|*.sh)
        targets+=("${repo_root}/${f}")
        ;;
      *)
        ;;
    esac
  done

  if [[ "${#targets[@]}" -eq 0 ]]; then
    detail "JSCPD: no staged files eligible for duplication scan."
    exit 0
  fi
fi

if [[ "${#JSCPD_ARGS[@]}" -gt 0 ]]; then
  "${JSCPD_BIN}" --config "${config_path}" ${JSCPD_ARGS[@]+"${JSCPD_ARGS[@]}"} ${targets[@]+"${targets[@]}"}
else
  "${JSCPD_BIN}" --config "${config_path}" ${targets[@]+"${targets[@]}"}
fi
