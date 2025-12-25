#!/usr/bin/env bash
set -euo pipefail

# Simple completion notifier for Validate-CI
if [[ -n "${PS_PLATFORM_ROOT:-}" && -f "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" ]]; then
  bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" "ci.validate" "Validate-CI complete" 2>/dev/null || true
fi

echo "PS.VALIDATE_CI: OK"
