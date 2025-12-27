#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Semgrep CLI Orchestrator
# ------------------------------------------------------------------------------
# Purpose:
#   Validate inputs, install Semgrep, run scan, and enforce policy with SARIF.
#
# Dependencies:
#   - tools/scripts/security/semgrep-validate-inputs.sh
#   - tools/scripts/security/semgrep-install.sh
#   - tools/scripts/security/semgrep-scan.sh
#   - tools/scripts/security/semgrep-enforce.sh
#
# Dependents:
#   - ./.github/actions/ps-task/semgrep-cli
# ==============================================================================
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  # If the script is being sourced, return so the caller can handle the error.
  # If the script is being executed directly, exit to stop the process.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  else
    exit 1
  fi
}

version="${SEMGREP_VERSION:-}"
config="${SEMGREP_CONFIG:-p/ci}"
scan_path="${SEMGREP_PATH:-.}"
output="${SEMGREP_OUTPUT:-reports/semgrep/semgrep.sarif}"
checksum="${SEMGREP_SHA256:-}"
fail_on_findings="${SEMGREP_FAIL_ON_FINDINGS:-true}"
allow_unverified="${SEMGREP_ALLOW_UNVERIFIED:-false}"

SEMGREP_VERSION_INPUT="${version}"
SEMGREP_FAIL_ON_FINDINGS_INPUT="${fail_on_findings}"
SEMGREP_OUTPUT_INPUT="${output}"
SEMGREP_CONFIG_INPUT="${config}"
SEMGREP_PATH_INPUT="${scan_path}"
SEMGREP_SHA256_INPUT="${checksum}"
SEMGREP_ALLOW_UNVERIFIED_INPUT="${allow_unverified}"

export SEMGREP_VERSION_INPUT
export SEMGREP_FAIL_ON_FINDINGS_INPUT
export SEMGREP_OUTPUT_INPUT
export SEMGREP_CONFIG_INPUT
export SEMGREP_PATH_INPUT
export SEMGREP_SHA256_INPUT
export SEMGREP_ALLOW_UNVERIFIED_INPUT

bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-validate-inputs.sh"

bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-install.sh"

installed_version="$(semgrep --version | sed -E 's/[^0-9]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/' | head -n1)"
if [[ -z "${installed_version}" ]]; then
  fail "Semgrep version check failed (no version output)."
fi
if [[ "${installed_version}" != "${SEMGREP_VERSION_INPUT}" ]]; then
  fail "Semgrep version mismatch (expected ${SEMGREP_VERSION_INPUT}, got ${installed_version})."
fi

rm -f "${GITHUB_WORKSPACE}/.semgrep-exit-code.txt"

SEMGREP_SEND_METRICS=off \
  bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-scan.sh"

upload_sarif() {
  local sarif_path="$1"
  local token="${GITHUB_TOKEN:-}"
  local repo="${GITHUB_REPOSITORY:-}"
  local sha="${GITHUB_SHA:-}"
  local ref="${GITHUB_REF:-}"
  [[ -n "${token}" ]] || fail "GITHUB_TOKEN is required to upload SARIF"
  [[ -n "${repo}" ]] || fail "GITHUB_REPOSITORY is required to upload SARIF"
  [[ -n "${sha}" ]] || fail "GITHUB_SHA is required to upload SARIF"
  [[ -n "${ref}" ]] || fail "GITHUB_REF is required to upload SARIF"
  [[ -f "${sarif_path}" ]] || fail "SARIF not found at ${sarif_path}"

  python3 - <<'PY'
import base64
import gzip
import json
import os
import urllib.request

sarif_path = os.environ["SARIF_PATH"]
repo = os.environ["GITHUB_REPOSITORY"]
token = os.environ["GITHUB_TOKEN"]
sha = os.environ["GITHUB_SHA"]
ref = os.environ["GITHUB_REF"]
api_url = os.environ.get("GITHUB_API_URL", "https://api.github.com")

with open(sarif_path, "rb") as f:
    compressed_data = gzip.compress(f.read())
    sarif_b64 = base64.b64encode(compressed_data).decode("ascii")

payload = {
    "commit_sha": sha,
    "ref": ref,
    "sarif": sarif_b64,
    "compression": "gzip",
}

data = json.dumps(payload).encode("utf-8")
url = f"{api_url}/repos/{repo}/code-scanning/sarifs"
req = urllib.request.Request(
    url,
    data=data,
    headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status < 200 or resp.status >= 300:
            raise SystemExit(f"SARIF upload failed with status {resp.status}")
        body = resp.read().decode("utf-8")
        print(f"PS.SEMGREP: upload status={resp.status}")
        if body:
            print(body)
except Exception as exc:
    raise SystemExit(f"SARIF upload failed: {exc}") from exc
PY
  return 0
}

sarif_path="${output}"
if [[ "${sarif_path}" != /* ]]; then
  sarif_path="${GITHUB_WORKSPACE}/${sarif_path}"
fi
SARIF_PATH="${sarif_path}" upload_sarif "${sarif_path}"

SEMGREP_FAIL_ON_FINDINGS_INPUT="${fail_on_findings}" \
  bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-enforce.sh"
