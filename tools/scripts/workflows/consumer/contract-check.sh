#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere - Consumer Contract Check
# ------------------------------------------------------------------------------
# Purpose:
#   Validate consumer repositories against a declared contract policy.
#
# Policy:
#   - In CI: contract policy must exist and violations fail the job.
#   - Locally: runs with the same behavior for determinism.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

policy_path="${PS_CONTRACT_POLICY:-${repo_root}/configs/consumer/contract.json}"
exceptions_path="${PS_CONTRACT_EXCEPTIONS:-${repo_root}/configs/consumer/exceptions.json}"
report_path="${PS_CONTRACT_REPORT:-${repo_root}/reports/contracts/contract.json}"
summary_path="${PS_CONTRACT_SUMMARY:-${repo_root}/reports/contracts/contract.txt}"
log_dir="${PS_LOG_DIR:-${repo_root}/logs/contracts}"
log_path="${log_dir}/contract-check.log"
baseline_path="${PS_CONTRACT_BASELINE:-}"

if [[ "${CI:-0}" == "1" && ! -f "${policy_path}" ]]; then
  error "contract policy missing at ${policy_path}"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  error "node is required but not found on PATH"
  exit 1
fi

required_node_version="22.0.0"
node_version_raw="$(node -v 2>/dev/null || true)"
node_version="${node_version_raw#v}"
if [[ -z "${node_version}" ]]; then
  error "unable to determine node version"
  exit 1
fi
if ! printf '%s\n%s\n' "${required_node_version}" "${node_version}" | sort -V -C; then
  error "node ${required_node_version}+ required (found ${node_version})"
  exit 1
fi

if [[ ! -d "${repo_root}/node_modules" ]]; then
  error "node_modules missing at ${repo_root}/node_modules"
  detail_err "HINT: install dependencies before running contract checks."
  exit 1
fi

mkdir -p "${log_dir}"

node "${repo_root}/tools/scripts/workflows/consumer/contract-check.js" \
  --policy "${policy_path}" \
  --exceptions "${exceptions_path}" \
  --report "${report_path}" \
  --summary "${summary_path}" \
  ${baseline_path:+--baseline "${baseline_path}"} \
  2>&1 | tee "${log_path}"
