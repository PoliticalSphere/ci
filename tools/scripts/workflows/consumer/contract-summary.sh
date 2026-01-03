#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Script: contract-summary.sh
# License: Proprietary
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/workflows/consumer/contract-summary.sh
#   file_type: script
#   language: bash
#   version: 1.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Appends contract summary to GitHub Step Summary with path safety validation:
#   - Validates summary path is repo-relative (no absolute paths)
#   - Checks for path traversal attacks (no "..")
#   - Safely appends file content to GITHUB_STEP_SUMMARY
#
# DEPENDENCIES
# -----------------------------------------------------------------------------
# dependencies:
#   internal: []
#   external: [bash, cat]
#
# ENVIRONMENT (INPUT)
# -----------------------------------------------------------------------------
# env:
#   required:
#     - SUMMARY_PATH: Path to summary file (repo-relative)
#   optional:
#     - GITHUB_STEP_SUMMARY: GitHub Actions step summary file
#
# ==============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Validate path
# -----------------------------------------------------------------------------
summary_path="${SUMMARY_PATH:-}"
if [[ -z "${summary_path}" ]]; then
  exit 0
fi

# Protect against unsafe user-controlled paths: ensure repo-relative,
# no traversal or absolute paths
if [[ "${summary_path}" = /* ]] || [[ "${summary_path}" == *".."* ]]; then
  echo "WARN: summary_path appears unsafe or contains traversal," \
    "skipping: ${summary_path}" >&2
  exit 0
fi

# -----------------------------------------------------------------------------
# Append to step summary
# -----------------------------------------------------------------------------
if [[ -f "${summary_path}" && -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  # Use explicit -- to avoid filename starting with '-'
  cat -- "${summary_path}" >> "${GITHUB_STEP_SUMMARY}"
fi

return 0
