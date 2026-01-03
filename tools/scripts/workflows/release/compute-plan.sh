#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Compute Release Plan
# ------------------------------------------------------------------------------
# Purpose:
#   Compute release plan (dry-run) and write JSON to reports/summary/.
# ==============================================================================

# Compute release plan (dry-run) and write JSON to reports/summary/release-plan.json
format_sh="${PS_PLATFORM_ROOT}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  ps_print_section "release.plan" "Compute release plan (no mutation)"
fi

repo_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"
if [[ -f "${repo_root}/tools/scripts/egress.sh" ]]; then
  # shellcheck source=tools/scripts/egress.sh
  . "${repo_root}/tools/scripts/egress.sh"
  load_egress_allowlist || { echo "ERROR: egress allowlist load failed" >&2; exit 1; }
fi

version="${PS_RELEASE_VERSION:-}"
if [[ -z "${version}" ]]; then
  echo "ERROR: release_version is required" >&2
  exit 1
fi
if [[ "${version}" == v* ]]; then
  echo "ERROR: release_version must NOT include a leading 'v' (got: ${version})" >&2
  exit 1
fi

release_ref="${PS_RELEASE_REF:-}"
if [[ -z "${release_ref}" ]]; then
  echo "ERROR: release_ref is required" >&2
  exit 1
fi

tag="v${version}"
if declare -F assert_egress_allowed_git_remote >/dev/null 2>&1; then
  assert_egress_allowed_git_remote origin
fi
git fetch --quiet --tags --force
target_sha="$(git rev-parse --verify "${release_ref}^{commit}")"
echo "PS.RELEASE_PLAN: tag=${tag}"
echo "PS.RELEASE_PLAN: ref=${release_ref}"
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
  "release_ref": "${release_ref}",
  "target_sha": "${target_sha}",
  "notes_mode": "${notes_mode}"
}
JSON

echo "PS.RELEASE_PLAN: OK"
