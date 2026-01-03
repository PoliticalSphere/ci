#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Prepare Release Notes
# ------------------------------------------------------------------------------
# Purpose:
#   Determine release notes mode (inline, file, or auto-generate).
# ==============================================================================

format_sh="${PS_PLATFORM_ROOT}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  ps_print_section "release.notes" "Prepare release notes mode"
fi

mode="none"
if [[ -n "${PS_RELEASE_NOTES_INLINE:-}" ]]; then
  mode="inline"
elif [[ -n "${PS_RELEASE_NOTES_PATH:-}" ]]; then
  mode="file"
elif [[ "${PS_GENERATE_NOTES:-false}" == "true" ]]; then
  mode="generate"
fi

echo "mode=${mode}" >> "$GITHUB_OUTPUT"

if [[ "${mode}" == "file" && ! -f "${PS_RELEASE_NOTES_PATH}" ]]; then
  echo "ERROR: release_notes_path not found: ${PS_RELEASE_NOTES_PATH}" >&2
  exit 1
fi

echo "PS.RELEASE_NOTES: mode=${mode}"
