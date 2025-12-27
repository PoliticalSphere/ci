#!/usr/bin/env bash
set -euo pipefail

# Install platform dependencies inside PS_PLATFORM_ROOT
:
"${PS_PLATFORM_ROOT:?PS_PLATFORM_ROOT must be set}" >/dev/null

if [[ ! -d "${PS_PLATFORM_ROOT}" ]]; then
  echo "ERROR: PS_PLATFORM_ROOT not found: ${PS_PLATFORM_ROOT}" >&2
  exit 1
fi

cd "${PS_PLATFORM_ROOT}"
echo "PS.INSTALL_PLATFORM_DEPS: npm ci --no-audit --no-fund"
npm ci --no-audit --no-fund
echo "PS.INSTALL_PLATFORM_DEPS: OK"
