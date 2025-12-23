#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Hadolint
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Dockerfiles with the platform configuration.
#
# Modes:
#   - Default (local): checks staged Dockerfiles only (fast)
#   - CI / full scan: checks all Dockerfiles when PS_FULL_SCAN=1 or CI=1
#
# Usage:
#   bash tools/scripts/lint/hadolint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/hadolint.sh
# ==============================================================================

has_git=1
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  repo_root="$(pwd)"
  has_git=0
fi
format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

config_path="${repo_root}/configs/lint/hadolint.yaml"
if [[ ! -f "${config_path}" ]]; then
  ps_error "hadolint config not found at ${config_path}"
  exit 1
fi

if ! command -v hadolint >/dev/null 2>&1; then
  ps_error "hadolint is required but not found on PATH"
  ps_detail_err "HINT: install hadolint or provide it via your tooling image."
  exit 1
fi

# Pass-through args safely (e.g. --format=json).
HADOLINT_ARGS=()
if [[ "$#" -gt 0 ]]; then
  HADOLINT_ARGS+=("$@")
fi

targets=()
full_scan="${PS_FULL_SCAN:-0}"
if [[ "${CI:-0}" == "1" ]]; then
  full_scan="1"
fi
if [[ "${has_git}" == "0" ]]; then
  full_scan="1"
fi

is_dockerfile_path() {
  local p="$1"
  local base
  base="$(basename "${p}")"

  # Common Dockerfile naming patterns:
  # - Dockerfile
  # - Dockerfile.dev / Dockerfile.prod / Dockerfile.ci
  # - Dockerfile.<name>
  # - <name>.Dockerfile
  if [[ "${base}" == "Dockerfile" ]]; then return 0; fi
  if [[ "${base}" == Dockerfile.* ]]; then return 0; fi
  if [[ "${base}" == *.Dockerfile ]]; then return 0; fi
  return 1
}

if [[ "${full_scan}" == "1" ]]; then
  while IFS= read -r -d '' f; do
    if is_dockerfile_path "${f}"; then
      targets+=("${f}")
    fi
  done < <(find "${repo_root}" -type f \( -name "Dockerfile" -o -name "Dockerfile.*" -o -name "*.Dockerfile" \) -print0)
else
  staged=()
  while IFS= read -r f; do
    staged+=("${f}")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z | tr '\0' '\n')
  for f in ${staged[@]+"${staged[@]}"}; do
    if is_dockerfile_path "${f}"; then
      targets+=("${repo_root}/${f}")
    fi
  done

  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Hadolint: no staged Dockerfiles to check."
    exit 0
  fi
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "Hadolint: no Dockerfiles to check."
  exit 0
fi

hadolint --config "${config_path}" "${HADOLINT_ARGS[@]}" "${targets[@]}"
