#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Trivy Filesystem Scan
# ------------------------------------------------------------------------------
# Purpose:
#   Run Trivy filesystem scan and emit SARIF for code scanning.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

config_path="${repo_root}/configs/security/trivy.yaml"
report_dir="${PS_REPORT_DIR:-${repo_root}/reports/security}"
report_path="${report_dir}/trivy.sarif"

if [[ ! -f "${config_path}" ]]; then
  error "trivy config missing at ${config_path}"
  exit 1
fi

if ! command -v trivy >/dev/null 2>&1; then
  error "trivy is required but not found on PATH"
  exit 1
fi

mkdir -p "${report_dir}"

export TRIVY_CACHE_DIR="${repo_root}/.cache/trivy"
mkdir -p "${TRIVY_CACHE_DIR}"

db_args=()
if [[ -d "${TRIVY_CACHE_DIR}/db" ]]; then
  db_args=(--skip-db-update)
  detail "Trivy scan: using cached DB (skip update)."
fi

trivy fs \
  --config "${config_path}" \
  --scanners vuln,misconfig \
  --format sarif \
  --output "${report_path}" \
  "${db_args[@]}" \
  "${repo_root}"

if [[ ! -f "${report_path}" ]]; then
  error "trivy did not produce SARIF at ${report_path}"
  exit 1
fi

if command -v python3 >/dev/null 2>&1 && [[ -f "${report_path}" ]]; then
  python3 - <<'PY' "${report_path}"
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    report_doc = json.load(f)

results = []
for run in report_doc.get("runs", []):
    results.extend(run.get("results", []))

severities = {}
for res in results:
    sev = res.get("properties", {}).get("security-severity", "0")
    severities[sev] = severities.get(sev, 0) + 1

print(f"PS.TRIVY: vulnerabilities={len(results)} by_severity={severities}")
PY
fi

detail "Trivy scan: OK"
