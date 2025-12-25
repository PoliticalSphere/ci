#!/usr/bin/env bash
set -euo pipefail

version="${PS_RELEASE_VERSION:-}"
tag="v${version}"

bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" "release.verify" "Verify tag + release match intended ref" 2>/dev/null || true

git fetch --quiet --tags --force
expected_sha="$(git rev-parse --verify "${PS_RELEASE_REF}^{commit}")"

tag_sha="$(git rev-list -n 1 "${tag}")"
if [[ "${tag_sha}" != "${expected_sha}" ]]; then
  echo "ERROR: tag ${tag} points to ${tag_sha}, expected ${expected_sha} (from ${PS_RELEASE_REF})" >&2
  exit 1
fi
echo "PS.RELEASE_VERIFY: tag_ok (${tag} -> ${tag_sha})"

rel_json="$(gh release view "${tag}" --json tagName,targetCommitish,url)"
echo "${rel_json}" > "reports/summary/release-verification.json"
echo "PS.RELEASE_VERIFY: release_exists (${tag})"
