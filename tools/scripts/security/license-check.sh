#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere - License Compliance Check
# ------------------------------------------------------------------------------
# Purpose:
#   Enforce OSS license compliance using the repository policy.
#
# Policy:
#   - In CI: policy + lockfile are mandatory.
#   - Locally: fail with clear guidance if inputs are missing.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

policy_path="${PS_LICENSE_POLICY:-${repo_root}/configs/security/license-policy.yml}"
lock_path="${PS_LICENSE_LOCK_PATH:-${repo_root}/package-lock.json}"
report_dir="${PS_REPORT_DIR:-${repo_root}/reports/security}"
summary_path="${PS_LICENSE_SUMMARY:-${report_dir}/license-summary.txt}"
report_path="${PS_LICENSE_REPORT:-${report_dir}/license-report.json}"
log_dir="${PS_LOG_DIR:-${repo_root}/logs/security}"
log_path="${log_dir}/license-check.log"

if [[ "${CI:-0}" == "1" && ! -f "${policy_path}" ]]; then
  error "license policy missing at ${policy_path}"
  exit 1
fi

if [[ "${CI:-0}" == "1" && ! -f "${lock_path}" ]]; then
  error "package-lock.json not found at ${lock_path}"
  exit 1
fi

if [[ ! -f "${policy_path}" ]]; then
  error "license policy missing at ${policy_path}"
  detail_err "HINT: configure configs/security/license-policy.yml"
  exit 1
fi

if [[ ! -f "${lock_path}" ]]; then
  error "package-lock.json not found at ${lock_path}"
  detail_err "HINT: run npm ci to generate a lockfile before running checks"
  exit 1
fi

mkdir -p "${report_dir}" "${log_dir}"

node "${repo_root}/tools/scripts/security/license-check.js" \
  --policy "${policy_path}" \
  --lock "${lock_path}" \
  --report "${report_path}" \
  --summary "${summary_path}" \
  2>&1 | tee "${log_path}"
