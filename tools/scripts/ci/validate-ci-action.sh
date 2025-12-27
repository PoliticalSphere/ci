#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------------------------------------
# Step: Preconditions
# ----------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required but not found on PATH" >&2
  exit 1
fi

if [[ -z "${GITHUB_WORKSPACE:-}" ]]; then
  echo "ERROR: GITHUB_WORKSPACE is not set (unexpected in GitHub Actions)" >&2
  exit 1
fi

# PS_PLATFORM_ROOT MUST be set by the workflow.
# Example:
#   env:
#     PS_PLATFORM_ROOT: ${{ github.workspace }}/.ps-platform
: "${PS_PLATFORM_ROOT:?PS_PLATFORM_ROOT must be set by the workflow (path to checked-out platform repo)}"

platform_root="${PS_PLATFORM_ROOT}"

# ----------------------------------------------------------------------
# Step: Debug (safe)
# ----------------------------------------------------------------------
printf '%q\n' "DEBUG: GITHUB_WORKSPACE=${GITHUB_WORKSPACE}"
printf '%q\n' "DEBUG: GITHUB_ACTION_PATH=${GITHUB_ACTION_PATH:-<unset>}"
printf '%q\n' "DEBUG: PS_PLATFORM_ROOT=${platform_root}"

# Show that expected directories exist (no recursive listing to keep logs tidy)
if [[ ! -d "${platform_root}" ]]; then
  printf '%q\n' "ERROR: PS_PLATFORM_ROOT directory not found: ${platform_root}" >&2
  echo "HINT: ensure the workflow checks out the platform repo into that path." >&2
  exit 1
fi

# ----------------------------------------------------------------------
# Step: Locate platform artefacts
# ----------------------------------------------------------------------
validator="${platform_root}/tools/scripts/ci/validate-ci/index.js"
config_path="${platform_root}/configs/ci/policies/validate-ci.yml"

if [[ ! -f "${validator}" ]]; then
  printf '%q\n' "ERROR: validate-ci script not found at: ${validator}" >&2
  echo "HINT: did you checkout the platform repo correctly into PS_PLATFORM_ROOT?" >&2
  exit 1
fi

if [[ ! -f "${config_path}" ]]; then
  printf '%q\n' "ERROR: validate-ci config not found at: ${config_path}" >&2
  echo "HINT: ensure configs/ci/policies/validate-ci.yml exists in the platform repo." >&2
  exit 1
fi

printf 'PS.CI_VALIDATE: platform_root=%q\n' "$platform_root"
printf 'PS.CI_VALIDATE: config_path=%q\n' "$config_path"

# ----------------------------------------------------------------------
# Step: Execute
# ----------------------------------------------------------------------
export PS_VALIDATE_CI_CONFIG="${config_path}"
if type -t ps_detail >/dev/null 2>&1; then
  ps_detail "Executing Node-based policy engine..."
fi
node "${validator}"

echo "PS.CI_VALIDATE: OK"
