#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Release Publisher
# ------------------------------------------------------------------------------
# Purpose:
#   Create an annotated tag and GitHub Release for the platform repository.
#
# Inputs (env):
#   PS_RELEASE_VERSION   Required. SemVer without leading "v" (e.g. 1.2.3).
#   PS_GENERATE_NOTES    Optional. "true" (default) or "false".
#   PS_GIT_USER_NAME     Optional. Defaults to "political-sphere-ci".
#   PS_GIT_USER_EMAIL    Optional. Defaults to "ci@politicalsphere.invalid".
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  error "unable to determine repo root (are you in a git repo?)"
  exit 1
fi

cd "${repo_root}"

version="${PS_RELEASE_VERSION:-}"
if [[ -z "${version}" ]]; then
  error "PS_RELEASE_VERSION is required (e.g., 1.2.3)"
  exit 1
fi

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([\-][0-9A-Za-z\.-]+)?([+][0-9A-Za-z\.-]+)?$ ]]; then
  error "PS_RELEASE_VERSION is not valid SemVer: '${version}'"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  error "GitHub CLI (gh) not available on PATH"
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  error "GH_TOKEN is required to create a GitHub Release"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  error "working tree is not clean; aborting release."
  exit 1
fi

git config user.name "${PS_GIT_USER_NAME:-political-sphere-ci}"
git config user.email "${PS_GIT_USER_EMAIL:-ci@politicalsphere.invalid}"

tag="v${version}"

if git rev-parse "refs/tags/${tag}" >/dev/null 2>&1; then
  error "tag already exists: ${tag}"
  exit 1
fi

git tag -a "${tag}" -m "Release ${tag}"
git push origin "${tag}"

generate_notes="${PS_GENERATE_NOTES:-true}"
if [[ "${generate_notes}" == "true" ]]; then
  gh release create "${tag}" --title "${tag}" --notes-from-tag
else
  gh release create "${tag}" --title "${tag}" --notes "Release ${tag}"
fi
