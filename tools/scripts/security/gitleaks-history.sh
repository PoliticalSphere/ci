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
baseline_path="${repo_root}/.gitleaksignore"

if [[ ! -f "${config_path}" ]]; then
  error "gitleaks config missing at ${config_path}"
  exit 1
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  error "gitleaks is required but not found on PATH"
  exit 1
fi

mkdir -p "${report_dir}"

baseline_args=()
if [[ -f "${baseline_path}" ]]; then
  baseline_args=(--baseline-path "${baseline_path}")
  detail "Secrets scan (full history): baseline enabled (${baseline_path})."
fi

log_opts_args=()
if [[ -n "${PS_GITLEAKS_SINCE:-}" ]]; then
  log_opts_args=(--log-opts="--since=${PS_GITLEAKS_SINCE}")
  detail "Secrets scan (full history): log since ${PS_GITLEAKS_SINCE}."
fi

detail "Secrets scan (full history): running gitleaks..."
gitleaks detect \
  --source "${repo_root}" \
  --config "${config_path}" \
  --report-format sarif \
  --report-path "${report_path}" \
  --redact \
  "${log_opts_args[@]}" \
  "${baseline_args[@]}"
if command -v python3 >/dev/null 2>&1 && [[ -f "${report_path}" ]]; then
  python3 - <<'PY' "${report_path}"
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    sarif = json.load(f)

results = []
for run in sarif.get("runs", []):
    results.extend(run.get("results", []))

files = set()
for res in results:
    for loc in res.get("locations", []):
        uri = (
            loc.get("physicalLocation", {})
            .get("artifactLocation", {})
            .get("uri")
        )
        if uri:
            files.add(uri)

print(f"PS.GITLEAKS: findings={len(results)} files={len(files)}")
PY
fi
detail "Secrets scan (full history): OK"
