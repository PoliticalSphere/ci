#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Hadolint Lint Runner
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/lint/hadolint.sh
#   file_type: script
#   language: bash
#   version: 2.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Run Hadolint Dockerfile validation checks using repo configuration.
#
# Modes:
#   - Fast local (pre-commit): staged Dockerfiles only
#   - PR mode: affected Dockerfiles only
#   - Full scan: PS_FULL_SCAN=1 (or CI without PR context)
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/lint/hadolint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/runners/lint/hadolint.sh
#
# ==============================================================================

# Load runner abstraction
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_script_dir}/../../core/runner-base.sh"

# Configuration
readonly HADOLINT_ID="lint.hadolint"
readonly HADOLINT_TITLE="HADOLINT"
readonly HADOLINT_DESC="Dockerfile security and quality"
readonly HADOLINT_CONFIG="configs/lint/hadolint.yaml"
readonly HADOLINT_FILE_PATTERN="Dockerfile|Dockerfile.*|*.Dockerfile"

# Initialize runner
runner_init "${HADOLINT_ID}" "${HADOLINT_TITLE}" "${HADOLINT_DESC}"

# Require configuration and tool
runner_require_config "${HADOLINT_CONFIG}" "Hadolint config"
runner_require_tool "hadolint" "" "0"

# Collect Dockerfile targets
runner_collect_targets "${HADOLINT_FILE_PATTERN}"

# Filter to enforce Dockerfile naming patterns
local -a filtered=()
for f in "${RUNNER_TARGETS[@]}"; do
  local base
  base="$(basename -- "${f}")"
  if [[ "${base}" == "Dockerfile" ]] || \
     [[ "${base}" == Dockerfile.* ]] || \
     [[ "${base}" == *.Dockerfile ]]; then
    filtered+=("${f}")
  fi
done
RUNNER_TARGETS=("${filtered[@]}")

# Skip if no targets
if runner_skip_if_no_targets "No Dockerfiles to check"; then
  exit 0
fi

# Execute hadolint
runner_exec "${RUNNER_TOOL_BIN}" \
  --config "${RUNNER_CONFIG}" \
  "${RUNNER_TARGETS[@]}"

exit "${RUNNER_STATUS}"
