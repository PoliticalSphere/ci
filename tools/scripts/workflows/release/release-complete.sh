#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Release Complete
# ------------------------------------------------------------------------------
# Purpose:
#   Emit final release completion status.
# ==============================================================================

format_sh="${PS_PLATFORM_ROOT}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  ps_print_section "release" "Release complete"
fi
echo "PS.RELEASE: OK"
