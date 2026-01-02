#!/usr/bin/env bash
set -euo pipefail

bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" "release" "Release complete" 2>/dev/null || true
echo "PS.RELEASE: OK"
