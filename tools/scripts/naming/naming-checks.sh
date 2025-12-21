#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Naming Checks
# ------------------------------------------------------------------------------
# Purpose:
#   Enforce repository naming conventions via configs/ci/policies/naming-policy.json.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

policy_path="${repo_root}/configs/ci/policies/naming-policy.json"
if [[ ! -f "${policy_path}" ]]; then
  error "naming policy not found at ${policy_path}"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  error "node is required but not found on PATH"
  exit 1
fi

PS_NAMING_POLICY="${policy_path}" PS_REPO_ROOT="${repo_root}" node "${repo_root}/tools/scripts/naming/naming-checks.js"
