#!/usr/bin/env bash
set -euo pipefail

# Compute release plan (dry-run) and write JSON to reports/summary/release-plan.json
bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" "release.plan" "Compute release plan (no mutation)" 2>/dev/null || true

version="${PS_RELEASE_VERSION:-}"
if [[ -z "${version}" ]]; then
  echo "ERROR: release_version is required" >&2
  exit 1
fi
if [[ "${version}" == v* ]]; then
  echo "ERROR: release_version must NOT include a leading 'v' (got: ${version})" >&2
  exit 1
fi

tag="v${version}"
git fetch --quiet --tags --force
target_sha="$(git rev-parse --verify "${PS_RELEASE_REF}^{commit}")"
echo "PS.RELEASE_PLAN: tag=${tag}"
echo "PS.RELEASE_PLAN: ref=${PS_RELEASE_REF}"
echo "PS.RELEASE_PLAN: target_sha=${target_sha}"

if git rev-parse --verify --quiet "refs/tags/${tag}" >/dev/null; then
  existing_sha="$(git rev-list -n 1 "${tag}")"
  echo "PS.RELEASE_PLAN: tag_exists=true (sha=${existing_sha})"
  if [[ "${existing_sha}" != "${target_sha}" ]]; then
    echo "PS.RELEASE_PLAN: WARNING tag points to different commit than release_ref"
  fi
else
  echo "PS.RELEASE_PLAN: tag_exists=false"
fi

notes_mode="none"
if [[ -n "${PS_RELEASE_NOTES_INLINE:-}" ]]; then
  notes_mode="inline"
elif [[ -n "${PS_RELEASE_NOTES_PATH:-}" ]]; then
  notes_mode="file"
elif [[ "${PS_GENERATE_NOTES:-false}" == "true" ]]; then
  notes_mode="generate"
fi
echo "PS.RELEASE_PLAN: notes_mode=${notes_mode}"

mkdir -p reports/summary
cat > reports/summary/release-plan.json <<JSON
{
  "dry_run": true,
  "tag": "${tag}",
  "release_ref": "${PS_RELEASE_REF}",
  "target_sha": "${target_sha}",
  "notes_mode": "${notes_mode}"
}
JSON

echo "PS.RELEASE_PLAN: OK"
