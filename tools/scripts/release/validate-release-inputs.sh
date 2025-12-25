#!/usr/bin/env bash
set -euo pipefail

bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" "release.validate" "Validate release inputs (publish)" 2>/dev/null || true

version="${PS_RELEASE_VERSION:-}"
if [[ -z "${version}" ]]; then
  echo "ERROR: release_version is required" >&2
  exit 1
fi
if [[ "${version}" == v* ]]; then
  echo "ERROR: release_version must NOT include a leading 'v' (got: ${version})" >&2
  exit 1
fi

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([\-+][0-9A-Za-z\.-]+)?$ ]]; then
  echo "ERROR: release_version must look like SemVer (got: ${version})" >&2
  exit 1
fi

echo "PS.RELEASE_VALIDATE: OK"
