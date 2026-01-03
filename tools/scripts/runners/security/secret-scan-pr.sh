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
#   - In CI: requires a base ref (PS_BASE_REF or GITHUB_BASE_REF) to scope the
#     diff; missing base ref is a configuration error.
#   - Locally (bootstrap): if the scanner is not yet installed, exit cleanly
#     with a clear message to avoid blocking development.
#
# Implementation:
#   - Primary tool: gitleaks (free, widely used).
#   - Expected config: configs/security/gitleaks.toml
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

config_path="${repo_root}/configs/security/gitleaks.toml"
platform_config_path="${PS_PLATFORM_ROOT:-${repo_root}/.ps-platform}/configs/security/gitleaks.toml"
report_dir="${PS_REPORT_DIR:-${repo_root}/reports/security}"
report_path="${report_dir}/gitleaks-pr.sarif"
baseline_path="${repo_root}/.gitleaksignore"

if [[ "${PS_SKIP_SECRETS_SCAN:-0}" == "1" ]]; then
  detail "Secrets scan: skipped (PS_SKIP_SECRETS_SCAN=1)."
  exit 0
fi

if [[ ! -f "${config_path}" ]]; then
  if [[ -f "${platform_config_path}" ]]; then
    mkdir -p "$(dirname "${config_path}")"
    ln -s "${platform_config_path}" "${config_path}"
    detail "Secrets scan: linked platform config to ${config_path}."
  else
    error "gitleaks config missing at ${config_path}"
    detail_err "HINT: add configs/security/gitleaks.toml or provide PS_PLATFORM_ROOT with the config."
    exit 1
  fi
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

detail "Secrets scan: running gitleaks (fast)..."

baseline_args=()
if [[ -f "${baseline_path}" ]]; then
  baseline_args=(--baseline-path "${baseline_path}")
  detail "Secrets scan: baseline enabled (${baseline_path})."
fi

if [[ "${CI:-0}" == "1" ]]; then
  base_ref="${PS_BASE_REF:-${GITHUB_BASE_REF:-}}"
  if [[ -z "${base_ref}" ]]; then
    error "base ref is required for CI secret scanning but was not provided"
    detail_err "HINT: set PS_BASE_REF or GITHUB_BASE_REF to the PR base branch."
    exit 1
  fi
  log_ref="origin/${base_ref}"
  if git rev-parse --verify "${log_ref}" >/dev/null 2>&1; then
    gitleaks detect \
      --source "${repo_root}" \
      --config "${config_path}" \
      --log-opts="${log_ref}..HEAD" \
      --report-format sarif \
      --report-path "${report_path}" \
      --redact \
      "${baseline_args[@]}"
  else
    detail "Secrets scan: missing ${log_ref}; falling back to working tree scan."
    gitleaks detect \
      --source "${repo_root}" \
      --config "${config_path}" \
      --no-git \
      --report-format sarif \
      --report-path "${report_path}" \
      --redact \
      "${baseline_args[@]}"
  fi
else
  gitleaks detect \
    --source "${repo_root}" \
    --config "${config_path}" \
    --no-git \
    --report-format sarif \
    --report-path "${report_path}" \
    --redact \
    "${baseline_args[@]}"
fi

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

detail "Secrets scan: OK"
