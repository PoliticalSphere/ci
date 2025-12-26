#!/usr/bin/env bash
set -euo pipefail

platform_root="${PS_PLATFORM_ROOT:-}"
workspace_root="${GITHUB_WORKSPACE:-}"

if [[ -n "${platform_root}" && -d "${platform_root}" ]]; then
  scripts_root="${platform_root}"
  printf 'PS.TOOLS: scripts_root=PS_PLATFORM_ROOT (%s)\n' "${scripts_root}"
elif [[ -n "${workspace_root}" && -d "${workspace_root}" ]]; then
  scripts_root="${workspace_root}"
  printf 'PS.TOOLS: scripts_root=GITHUB_WORKSPACE (%s)\n' "${scripts_root}"
else
  printf 'ERROR: neither PS_PLATFORM_ROOT nor GITHUB_WORKSPACE is available\n' >&2
  exit 1
fi

printf 'PS_SCRIPTS_ROOT=%s\n' "${scripts_root}" >> "${GITHUB_ENV}"
