#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — License Compliance Check
# ==============================================================================
#
# PURPOSE
# ------------------------------------------------------------------------------
# Enforce OSS license compliance using a policy file and dependency lockfile.
#
# CONTRACT
# ------------------------------------------------------------------------------
# - In CI: policy + lockfile are mandatory.
# - Locally: missing inputs fail with clear guidance.
# - Outputs:
#   - reports/security/license-report.json
#   - reports/security/license-summary.txt
#   - logs/security/license-check.log
#
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------
is_truthy() { [[ "${1:-}" == "1" || "${1:-}" == "true" ]]; return $?; }

safe_relpath_or_die() {
  # Reject empty, absolute, or traversal-containing paths. Allows repo-relative paths.
  local p="${1:-}"
  local label="${2:-path}"
  if [[ -z "${p}" ]]; then
    error "${label} must not be empty"
    exit 1
  fi
  if [[ "${p}" == /* || "${p}" == *".."* ]]; then
    error "${label} must be repo-relative and traversal-free (got: ${p})"
    exit 1
  fi
  return 0
}

section() {
  # Best-effort section printing (does nothing if platform branding is unavailable).
  local id="${1:-license}"
  local title="${2:-}"
  local desc="${3:-}"
  if [[ -f "${repo_root}/tools/scripts/branding/print-section.sh" ]]; then
    bash "${repo_root}/tools/scripts/branding/print-section.sh" "${id}" "${title}" "${desc}"
  else
    printf '\n== %s ==\n' "${title}"
    [[ -n "${desc}" ]] && printf '%s\n' "${desc}"
  fi
  return 0
}

epoch_now() {
  if [[ -n "${SOURCE_DATE_EPOCH:-}" && "${SOURCE_DATE_EPOCH}" =~ ^[0-9]+$ ]]; then
    printf '%s' "${SOURCE_DATE_EPOCH}"
    return 0
  fi
  date +%s
}

epoch_to_iso() {
  local epoch="$1"
  if date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
    return 0
  fi
  date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
}

now_iso() { epoch_to_iso "$(epoch_now)"; return 0; }

hash_file_sha256() {
  local p="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "${p}"
import hashlib, sys
with open(sys.argv[1], "rb") as handle:
    print(hashlib.sha256(handle.read()).hexdigest())
PY
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${p}" | awk '{print $1}'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${p}" | awk '{print $1}'
    return 0
  fi
  error "sha256 tool missing for policy hash verification"
  exit 1
}

stat_mtime() {
  local p="$1"
  if stat -c %Y "${p}" >/dev/null 2>&1; then
    stat -c %Y "${p}"
    return 0
  fi
  if stat -f %m "${p}" >/dev/null 2>&1; then
    stat -f %m "${p}"
    return 0
  fi
  error "stat does not support mtime for ${p}"
  exit 1
}

upper_class='[:upper:]'
lower_class='[:lower:]'

# ------------------------------------------------------------------------------
# Resolve inputs (allow repo-relative overrides; default to repo-root paths)
# ------------------------------------------------------------------------------
policy_rel="${PS_LICENSE_POLICY:-configs/security/license-policy.yml}"
lock_rel="${PS_LICENSE_LOCK_PATH:-package-lock.json}"
report_dir_rel="${PS_REPORT_DIR:-reports/security}"
log_dir_rel="${PS_LOG_DIR:-logs/security}"

# Optional override outputs (also repo-relative)
summary_rel="${PS_LICENSE_SUMMARY:-${report_dir_rel}/license-summary.txt}"
report_rel="${PS_LICENSE_REPORT:-${report_dir_rel}/license-report.json}"
run_meta_rel="${PS_LICENSE_RUN_META:-${report_dir_rel}/license-run.json}"
policy_baseline_rel="${PS_LICENSE_POLICY_BASELINE:-}"
policy_baseline_hash="${PS_LICENSE_POLICY_SHA256:-}"

# Validate path safety for anything that might be overridden via env
safe_relpath_or_die "${policy_rel}" "PS_LICENSE_POLICY"
safe_relpath_or_die "${lock_rel}" "PS_LICENSE_LOCK_PATH"
safe_relpath_or_die "${report_dir_rel}" "PS_REPORT_DIR"
safe_relpath_or_die "${log_dir_rel}" "PS_LOG_DIR"
safe_relpath_or_die "${summary_rel}" "PS_LICENSE_SUMMARY"
safe_relpath_or_die "${report_rel}" "PS_LICENSE_REPORT"
safe_relpath_or_die "${run_meta_rel}" "PS_LICENSE_RUN_META"
if [[ -n "${policy_baseline_rel}" ]]; then
  safe_relpath_or_die "${policy_baseline_rel}" "PS_LICENSE_POLICY_BASELINE"
fi

policy_path="${repo_root}/${policy_rel}"
lock_path="${repo_root}/${lock_rel}"
report_dir="${repo_root}/${report_dir_rel}"
log_dir="${repo_root}/${log_dir_rel}"

summary_path="${repo_root}/${summary_rel}"
report_path="${repo_root}/${report_rel}"
run_meta_path="${repo_root}/${run_meta_rel}"
log_path="${log_dir}/license-check.log"
policy_baseline_path=""
if [[ -n "${policy_baseline_rel}" ]]; then
  policy_baseline_path="${repo_root}/${policy_baseline_rel}"
fi

# ------------------------------------------------------------------------------
# Preconditions
# ------------------------------------------------------------------------------
section "security.license" "License compliance" "Validate dependency licenses against policy"

if is_truthy "${CI:-0}"; then
  if [[ ! -f "${policy_path}" ]]; then
    error "license policy missing at ${policy_path}"
    detail_err "HINT: expected ${policy_rel} (set PS_LICENSE_POLICY to override)"
    exit 1
  fi
  if [[ ! -f "${lock_path}" ]]; then
    error "lockfile not found at ${lock_path}"
    detail_err "HINT: expected ${lock_rel} (set PS_LICENSE_LOCK_PATH to override)"
    exit 1
  fi
else
  if [[ ! -f "${policy_path}" ]]; then
    error "license policy missing at ${policy_path}"
    detail_err "HINT: create ${policy_rel} (or set PS_LICENSE_POLICY)"
    exit 1
  fi
  if [[ ! -f "${lock_path}" ]]; then
    error "lockfile not found at ${lock_path}"
    detail_err "HINT: generate a lockfile before running checks (e.g. npm ci)"
    exit 1
  fi
fi

mkdir -p "${report_dir}" "${log_dir}"

if [[ -t 1 ]]; then
  export FORCE_COLOR="1"
fi

# ------------------------------------------------------------------------------
# Execution
# ------------------------------------------------------------------------------
section "security.license.run" "Run license scanner" "Emit JSON report + summary"

# ------------------------------------------------------------------------------
# Pre-flight integrity checks (optional hardening)
# ------------------------------------------------------------------------------
if [[ -n "${policy_baseline_path}" ]]; then
  if [[ ! -f "${policy_baseline_path}" ]]; then
    error "policy baseline hash file not found at ${policy_baseline_rel}"
    exit 1
  fi
  policy_baseline_hash="$(tr -d '[:space:]' < "${policy_baseline_path}")"
fi

if [[ -n "${policy_baseline_hash}" ]]; then
  expected_hash="$(printf '%s' "${policy_baseline_hash}" | tr "${upper_class}" "${lower_class}")"
  actual_hash="$(hash_file_sha256 "${policy_path}" | tr "${upper_class}" "${lower_class}")"
  if [[ "${actual_hash}" != "${expected_hash}" ]]; then
    error "policy baseline mismatch before run: expected ${expected_hash}, got ${actual_hash}"
    exit 1
  fi
fi

lock_mtime_pre="$(stat_mtime "${lock_path}")"

start_epoch="$(epoch_now)"
start_ts="$(epoch_to_iso "${start_epoch}")"

# Run node tool; tee to log. pipefail ensures we keep the node exit code.
node "${repo_root}/tools/scripts/security/license-check.js" \
  --policy "${policy_path}" \
  --lock "${lock_path}" \
  --report "${report_path}" \
  --summary "${summary_path}" \
  2>&1 | tee "${log_path}"

exit_code=$?

lock_mtime_post="$(stat_mtime "${lock_path}")"
if [[ "${lock_mtime_pre}" != "${lock_mtime_post}" ]]; then
  error "lockfile was modified during scan"
  exit_code=1
fi

end_epoch="$(epoch_now)"
end_ts="$(epoch_to_iso "${end_epoch}")"
duration_s=$(( end_epoch - start_epoch ))

# ------------------------------------------------------------------------------
# Policy hash baseline check (optional hardening)
# ------------------------------------------------------------------------------
if [[ -n "${policy_baseline_hash}" ]]; then
  if [[ ! -f "${report_path}" ]]; then
    error "policy baseline check failed: report not found at ${report_rel}"
    exit 1
  fi
  actual_policy_hash="$(
    python3 - <<'PY' "${report_path}"
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    report_doc = json.load(f)
print(report_doc.get("policy_sha256", ""))
PY
  )"
  expected_hash="$(printf '%s' "${policy_baseline_hash}" | tr "${upper_class}" "${lower_class}")"
  actual_hash="$(printf '%s' "${actual_policy_hash}" | tr "${upper_class}" "${lower_class}")"
  if [[ -z "${actual_hash}" ]]; then
    error "policy baseline check failed: policy_sha256 missing from report"
    exit 1
  fi
  if [[ "${actual_hash}" != "${expected_hash}" ]]; then
    error "policy baseline mismatch: expected ${expected_hash}, got ${actual_hash}"
    exit_code=1
  fi
fi

# ------------------------------------------------------------------------------
# Evidence: minimal run metadata (machine-readable)
# ------------------------------------------------------------------------------
EXIT_CODE="${exit_code}" \
START_TS="${start_ts}" \
END_TS="${end_ts}" \
DURATION_S="${duration_s}" \
POLICY_REL="${policy_rel}" \
LOCK_REL="${lock_rel}" \
REPORT_REL="${report_rel}" \
SUMMARY_REL="${summary_rel}" \
LOG_REL="${log_dir_rel}/license-check.log" \
RUN_META_PATH="${run_meta_path}" \
python3 - <<PY
import json, os
payload = {
  "tool": "license-check",
  "status": "success" if int(os.environ["EXIT_CODE"]) == 0 else "failure",
  "exit_code": int(os.environ["EXIT_CODE"]),
  "started_at": os.environ["START_TS"],
  "finished_at": os.environ["END_TS"],
  "duration_s": int(os.environ["DURATION_S"]),
  "policy_path": os.environ["POLICY_REL"],
  "lock_path": os.environ["LOCK_REL"],
  "report_path": os.environ["REPORT_REL"],
  "summary_path": os.environ["SUMMARY_REL"],
  "log_path": os.environ["LOG_REL"],
}
out = os.environ["RUN_META_PATH"]
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
  json.dump(payload, f, indent=2, sort_keys=True)
  f.write("\\n")
PY

# ------------------------------------------------------------------------------
# Outcome
# ------------------------------------------------------------------------------
if [[ "${exit_code}" -ne 0 ]]; then
  section "security.license.fail" "License compliance failed" "See ${log_dir_rel}/license-check.log"
  exit "${exit_code}"
fi

section "security.license.ok" "License compliance passed" "Report: ${report_rel}"
printf 'PS.LICENSE: OK\n'
