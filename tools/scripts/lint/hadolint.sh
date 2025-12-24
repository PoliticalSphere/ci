#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Hadolint (Deterministic)
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Dockerfiles using hadolint + repo config.
#
# Modes:
#   - Default (local): staged Dockerfiles only (fast)
#   - CI / full scan: all Dockerfiles when PS_FULL_SCAN=1 or CI=1
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

config_path="${repo_root}/configs/lint/hadolint.yaml"
if [[ ! -f "${config_path}" ]]; then
  ps_error "hadolint config not found: ${config_path}"
  exit 1
fi

HADOLINT_BIN="${HADOLINT_BIN:-hadolint}"
if ! command -v "${HADOLINT_BIN}" >/dev/null 2>&1; then
  ps_error "hadolint is required but not found on PATH"
  ps_detail_err "HINT: install hadolint or provide it via your tooling image."
  exit 1
fi

HADOLINT_ARGS=("$@")

# Recognise common Dockerfile patterns
_is_dockerfile_path() {
  local p="$1"
  local base
  base="$(basename -- "${p}")"

  [[ "${base}" == "Dockerfile" ]] && return 0
  [[ "${base}" == Dockerfile.* ]] && return 0
  [[ "${base}" == *.Dockerfile ]] && return 0
  return 1
}

targets=()

if [[ "${full_scan}" == "1" ]]; then
  # Find all plausible dockerfiles, then filter with naming rules.
  # (collect_targets_find already excludes node_modules/dist/build/etc.)
  collect_targets_find \( -name "Dockerfile" -o -name "Dockerfile.*" -o -name "*.Dockerfile" \)

  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Hadolint: no Dockerfiles found."
    exit 0
  fi

  # Filter to enforce naming rules consistently (defensive)
  filtered=()
  for f in "${targets[@]}"; do
    if _is_dockerfile_path "${f}"; then
      filtered+=("${f}")
    fi
  done
  targets=("${filtered[@]}")

else
  # Staged mode: collect staged files and filter via naming rules.
  # Note: case patterns support alternation with |.
  collect_targets_staged "Dockerfile|Dockerfile.*|*.Dockerfile"

  if [[ "${#targets[@]}" -eq 0 ]]; then
    ps_detail "Hadolint: no staged Dockerfiles to check."
    exit 0
  fi

  filtered=()
  for f in "${targets[@]}"; do
    if _is_dockerfile_path "${f}"; then
      filtered+=("${f}")
    fi
  done
  targets=("${filtered[@]}")
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "Hadolint: no Dockerfiles to check."
  exit 0
fi

"${HADOLINT_BIN}" --config "${config_path}" "${HADOLINT_ARGS[@]}" "${targets[@]}"
