#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Actionlint (Workflow Validation)
# ------------------------------------------------------------------------------
# Purpose:
#   Validate GitHub Actions workflow YAML files using actionlint.
#
# Modes:
#   - Default (local): staged workflow files only (fast)
#   - CI / full scan: all workflow files when PS_FULL_SCAN=1 or CI=1
#
# Determinism:
#   - Requires actionlint on PATH (or ACTIONLINT_BIN override).
#   - Does not attempt to install tools.
#
# Safety / UX:
#   - NUL-safe file handling
#   - Avoids long absolute paths in logs
#   - Defensive filtering: skips YAMLs in .github/workflows that do not appear to
#     be actual workflows (prevents “header count” style failures on templates).
#
# Usage:
#   bash tools/scripts/lint/actionlint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/lint/actionlint.sh
#   ACTIONLINT_BIN=/path/to/actionlint bash tools/scripts/lint/actionlint.sh
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
set_full_scan_flag

cd "${repo_root}"

config_path="${repo_root}/configs/lint/actionlint.yml"
if [[ ! -f "${config_path}" ]]; then
  ps_error "actionlint config not found: ${config_path}"
  exit 1
fi

ACTIONLINT_BIN="${ACTIONLINT_BIN:-actionlint}"
if ! command -v "${ACTIONLINT_BIN}" >/dev/null 2>&1; then
  ps_error "actionlint is required but not found on PATH"
  ps_detail_err "HINT: install actionlint (or set ACTIONLINT_BIN=/path/to/actionlint)"
  exit 1
fi

# Pass-through args (rare, but supported)
ACTIONLINT_ARGS=()
if [[ "$#" -gt 0 ]]; then
  ACTIONLINT_ARGS=("$@")
fi

# Friendly path for logs
_short_path() {
  local p="$1"
  if [[ -n "${repo_root:-}" && "${p}" == "${repo_root}/"* ]]; then
    printf '%s' "${p#"${repo_root}"/}"
  else
    printf '%s' "${p}"
  fi
  return 0
}

# Collect targets
targets=()

if [[ "${full_scan}" == "1" ]]; then
  if [[ -d "${repo_root}/.github/workflows" ]]; then
    while IFS= read -r -d '' f; do
      targets+=("${f}")
    done < <(find "${repo_root}/.github/workflows" -type f \( -name "*.yml" -o -name "*.yaml" \) -print0)
  fi
else
  # Uses shared staged collector (case-pattern supports alternation with |)
  collect_targets_staged ".github/workflows/*.yml|.github/workflows/*.yaml"
  # collect_targets_staged populates absolute paths into `targets`
fi

if [[ "${#targets[@]}" -eq 0 ]]; then
  ps_detail "Actionlint: no workflow files to check."
  exit 0
fi

# Filter: only lint files that *appear* to be workflows.
# Rationale: repos sometimes put templates/fragments in .github/workflows,
# which can trigger confusing parse errors.
declare -a lintable=()
for f in "${targets[@]}"; do
  # Heuristic: must contain a top-level `on:` key (typical workflow requirement)
  # Accept common forms:
  #   on:
  #   on: [push]
  #   on: { push: ... }
  if grep -Eq '^[[:space:]]*on:[[:space:]]*$|^[[:space:]]*on:[[:space:]]*[{[]' "${f}"; then
    lintable+=("${f}")
  else
    ps_detail "Actionlint: skipping non-workflow YAML: $(_short_path "${f}")"
  fi
done

if [[ "${#lintable[@]}" -eq 0 ]]; then
  ps_detail "Actionlint: nothing to lint after filtering."
  exit 0
fi

# Run actionlint
if [[ "${#ACTIONLINT_ARGS[@]}" -gt 0 ]]; then
  "${ACTIONLINT_BIN}" -config-file "${config_path}" "${ACTIONLINT_ARGS[@]}" "${lintable[@]}"
else
  "${ACTIONLINT_BIN}" -config-file "${config_path}" "${lintable[@]}"
fi
