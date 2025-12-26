#!/usr/bin/env bash
set -euo pipefail

# No-op placeholder: platform is either checked out into ${PS_PLATFORM_PATH_INPUT}
# or a snapshot was extracted there. Downstream steps should find scripts under that path.
printf 'PS.PLATFORM: ready (path=%s/%s)\n' "${GITHUB_WORKSPACE}" "${PS_PLATFORM_PATH_INPUT}"
