#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Verify Release
# ------------------------------------------------------------------------------
# Purpose:
#   Verify that the created tag and release match the intended ref.
# ==============================================================================

repo_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"
if [[ -f "${repo_root}/tools/scripts/egress.sh" ]]; then
  # shellcheck source=tools/scripts/egress.sh
  . "${repo_root}/tools/scripts/egress.sh"
  load_egress_allowlist || { echo "ERROR: egress allowlist load failed" >&2; exit 1; }
fi

version="${PS_RELEASE_VERSION:-}"
tag="v${version}"

format_sh="${PS_PLATFORM_ROOT}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  ps_print_section "release.verify" "Verify tag + release match intended ref"
fi

if declare -F assert_egress_allowed_git_remote >/dev/null 2>&1; then
  assert_egress_allowed_git_remote origin
fi
if declare -F assert_egress_allowed_url >/dev/null 2>&1; then
  assert_egress_allowed_url "${GITHUB_API_URL:-https://api.github.com}"
fi

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
