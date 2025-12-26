#!/usr/bin/env bash
set -euo pipefail

platform_root="${PS_PLATFORM_ROOT:-}"
workspace_root="${GITHUB_WORKSPACE:-$(pwd)}"

if [[ -n "${platform_root}" && -d "${platform_root}" ]]; then
  scripts_root="${platform_root}"
  printf 'PS.NODE_SETUP: scripts_root=PS_PLATFORM_ROOT (%s)\n' "${scripts_root}"
else
  scripts_root="${workspace_root}"
  printf 'PS.NODE_SETUP: scripts_root=GITHUB_WORKSPACE (%s)\n' "${scripts_root}"
fi

printf 'PS_SCRIPTS_ROOT=%s\n' "${scripts_root}" >> "${GITHUB_ENV}"
printf 'PS_WORKSPACE_ROOT=%s\n' "${workspace_root}" >> "${GITHUB_ENV}"
