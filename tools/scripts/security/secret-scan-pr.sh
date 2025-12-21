#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Secrets Scan (Fast PR)
# ------------------------------------------------------------------------------
# Purpose:
#   Fast secret scanning for PRs and local gates.
#
# Policy:
#   - In CI: secret scanning is mandatory. If the scanner is not available,
#     this is a configuration error and CI must fail.
#   - Locally (bootstrap): if the scanner is not yet installed, exit cleanly
#     with a clear message to avoid blocking development.
#
# Implementation:
#   - Primary tool: gitleaks (free, widely used).
#   - Expected config: configs/security/gitleaks.toml
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

config_path="${repo_root}/configs/security/gitleaks.toml"
report_dir="${PS_REPORT_DIR:-${repo_root}/reports/security}"
report_path="${report_dir}/gitleaks-pr.sarif"

# Prefer deterministic behaviour: require config in CI, allow bootstrap locally.
if [[ "${CI:-0}" == "1" && ! -f "${config_path}" ]]; then
  error "gitleaks config missing at ${config_path}"
  exit 1
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  if [[ "${CI:-0}" == "1" ]]; then
    error "gitleaks is required in CI but not found on PATH"
    detail_err "HINT: install gitleaks in the CI runner/tooling image."
    exit 1
  fi

  detail "Secrets scan: gitleaks not found (bootstrap mode)."
  detail "HINT: install gitleaks to enable local secret scanning."
  exit 0
fi

mkdir -p "${report_dir}"

# Fast scan scope:
# - Local/staged scans are ideal, but gitleaks is most reliable scanning the repo.
# - Keep this fast by using current working tree (no full history).
detail "Secrets scan: running gitleaks (fast)..."

# If config exists, use it; otherwise run with defaults (local bootstrap only).
if [[ -f "${config_path}" ]]; then
  gitleaks detect \
    --source "${repo_root}" \
    --config "${config_path}" \
    --no-git \
    --report-format sarif \
    --report-path "${report_path}" \
    --redact
else
  gitleaks detect \
    --source "${repo_root}" \
    --no-git \
    --report-format sarif \
    --report-path "${report_path}" \
    --redact
fi

detail "Secrets scan: OK"
