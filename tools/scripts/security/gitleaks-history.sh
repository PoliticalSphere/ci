#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Secrets Scan (Full History)
# ------------------------------------------------------------------------------
# Purpose:
#   Run a full-history secrets scan using gitleaks.
#
# Policy:
#   - In CI, gitleaks and config are required; fail if missing.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  error "unable to determine repo root (are you in a git repo?)"
  exit 1
fi

config_path="${repo_root}/configs/security/gitleaks.toml"
report_dir="${PS_REPORT_DIR:-${repo_root}/reports/security}"
report_path="${report_dir}/gitleaks-history.sarif"

if [[ ! -f "${config_path}" ]]; then
  error "gitleaks config missing at ${config_path}"
  exit 1
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  error "gitleaks is required but not found on PATH"
  exit 1
fi

mkdir -p "${report_dir}"

detail "Secrets scan (full history): running gitleaks..."
gitleaks detect \
  --source "${repo_root}" \
  --config "${config_path}" \
  --report-format sarif \
  --report-path "${report_path}" \
  --redact
detail "Secrets scan (full history): OK"
