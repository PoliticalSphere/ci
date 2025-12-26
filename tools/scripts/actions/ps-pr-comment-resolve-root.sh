#!/usr/bin/env bash
set -euo pipefail

workspace_root="${GITHUB_WORKSPACE:-$(pwd)}"
platform_root="${PS_PLATFORM_ROOT:-}"

if [[ -n "${platform_root}" && -d "${platform_root}" ]]; then
  scripts_root="${platform_root}"
  printf 'PS.PR_COMMENT: scripts_root=PS_PLATFORM_ROOT (%s)\n' "${scripts_root}"
else
  scripts_root="${workspace_root}"
  printf 'PS.PR_COMMENT: scripts_root=GITHUB_WORKSPACE (%s)\n' "${scripts_root}"
fi

printf 'PS_SCRIPTS_ROOT=%s\n' "${scripts_root}" >> "${GITHUB_ENV}"
