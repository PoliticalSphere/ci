#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Biome Lint
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/runners/lint/biome.sh
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
# Run Biome formatting + lint checks using repo configuration.
#
# Modes:
#   - Fast local (pre-commit): staged JS/TS/JSON only
#   - PR mode: affected files only
#   - Full scan: PS_FULL_SCAN=1 (or CI without PR context)
#
# USAGE
# -----------------------------------------------------------------------------
#   bash tools/scripts/runners/lint/biome.sh
#   bash tools/scripts/runners/lint/biome.sh --write
#   PS_FULL_SCAN=1 bash tools/scripts/runners/lint/biome.sh
#
# ==============================================================================

# -----------------------------------------------------------------------------
# Bootstrap: Load runner abstraction
# -----------------------------------------------------------------------------
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_script_dir}/../../core/runner-base.sh"

# -----------------------------------------------------------------------------
# Runner Configuration
# -----------------------------------------------------------------------------
readonly BIOME_ID="lint.biome"
readonly BIOME_TITLE="BIOME"
readonly BIOME_DESC="Formatting and correctness checks"
readonly BIOME_CONFIG="biome.json"
readonly BIOME_LOCAL_BIN="node_modules/.bin/biome"
readonly BIOME_FILE_PATTERN="*.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json|*.jsonc"

# -----------------------------------------------------------------------------
# Initialize Runner
# -----------------------------------------------------------------------------
runner_init "${BIOME_ID}" "${BIOME_TITLE}" "${BIOME_DESC}"

# Require configuration
runner_require_config "${BIOME_CONFIG}" "Biome config"

# Require tool (prefer local, allow global fallback)
runner_require_tool "biome" "${BIOME_LOCAL_BIN}" "1"

# Parse pass-through arguments (e.g., --write, --unsafe)
runner_parse_args "$@"

# -----------------------------------------------------------------------------
# Collect Targets
# -----------------------------------------------------------------------------
runner_collect_targets "${BIOME_FILE_PATTERN}"

# Skip if no targets
if runner_skip_if_no_targets "No staged JS/TS/JSON files to check"; then
  exit 0
fi

# -----------------------------------------------------------------------------
# Execute Biome
# -----------------------------------------------------------------------------
# Build command arguments
declare -a cmd_args=("check" "--config-path" "${RUNNER_CONFIG}")

# Add pass-through args if any
if [[ "${#RUNNER_ARGS[@]:-0}" -gt 0 ]]; then
  cmd_args+=("${RUNNER_ARGS[@]}")
fi

# Add targets
if [[ "${RUNNER_MODE}" == "full" ]]; then
  cmd_args+=("${PS_REPO_ROOT}")
else
  cmd_args+=("${RUNNER_TARGETS[@]}")
fi

# Execute
runner_exec "${RUNNER_TOOL_BIN}" "${cmd_args[@]}"
