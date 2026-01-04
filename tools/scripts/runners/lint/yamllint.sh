#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Yamllint Lint Runner
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/lint/yamllint.sh
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
# Run Yamllint YAML validation checks using repo configuration.
#
# Modes:
#   - Fast local (pre-commit): staged YAML files only
#   - PR mode: affected YAML files only
#   - Full scan: PS_FULL_SCAN=1 (or CI without PR context)
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/lint/yamllint.sh
#   PS_FULL_SCAN=1 bash tools/scripts/runners/lint/yamllint.sh
#
# ==============================================================================

# Load runner abstraction
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_script_dir}/../../core/runner-base.sh"

# Configuration
readonly YAMLLINT_ID="lint.yamllint"
readonly YAMLLINT_TITLE="YAMLLINT"
readonly YAMLLINT_DESC="YAML validity and formatting"
readonly YAMLLINT_CONFIG="configs/lint/yamllint.yml"
readonly YAMLLINT_FILE_PATTERN="*.yml|*.yaml"

# Initialize runner
runner_init "${YAMLLINT_ID}" "${YAMLLINT_TITLE}" "${YAMLLINT_DESC}"

# Require configuration and tool
runner_require_config "${YAMLLINT_CONFIG}" "Yamllint config"
runner_require_tool "yamllint" "" "0"

# Collect YAML targets
runner_collect_targets "${YAMLLINT_FILE_PATTERN}"

# Skip if no targets
if runner_skip_if_no_targets "No staged YAML files to check"; then
  exit 0
fi

# Execute yamllint
runner_exec "${RUNNER_TOOL_BIN}" \
  -c "${RUNNER_CONFIG}" \
  "${RUNNER_TARGETS[@]}"

exit "${RUNNER_STATUS}"

