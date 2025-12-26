#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

version="${SEMGREP_VERSION:-}"
config="${SEMGREP_CONFIG:-p/ci}"
scan_path="${SEMGREP_PATH:-.}"
output="${SEMGREP_OUTPUT:-reports/semgrep/semgrep.sarif}"
fail_on_findings="${SEMGREP_FAIL_ON_FINDINGS:-true}"

SEMGREP_VERSION_INPUT="${version}"
SEMGREP_FAIL_ON_FINDINGS_INPUT="${fail_on_findings}"
SEMGREP_OUTPUT_INPUT="${output}"
SEMGREP_CONFIG_INPUT="${config}"
SEMGREP_PATH_INPUT="${scan_path}"

export SEMGREP_VERSION_INPUT
export SEMGREP_FAIL_ON_FINDINGS_INPUT
export SEMGREP_OUTPUT_INPUT
export SEMGREP_CONFIG_INPUT
export SEMGREP_PATH_INPUT

bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-validate-inputs.sh"

bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-install.sh"

SEMGREP_SEND_METRICS=off \
  bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-scan.sh"

upload_sarif() {
  local sarif_path="$1"
  local token="${GITHUB_TOKEN:-}"
  local repo="${GITHUB_REPOSITORY:-}"
  local sha="${GITHUB_SHA:-}"
  local ref="${GITHUB_REF:-}"
  local api_url="${GITHUB_API_URL:-https://api.github.com}"

  [[ -n "${token}" ]] || fail "GITHUB_TOKEN is required to upload SARIF"
  [[ -n "${repo}" ]] || fail "GITHUB_REPOSITORY is required to upload SARIF"
  [[ -n "${sha}" ]] || fail "GITHUB_SHA is required to upload SARIF"
  [[ -n "${ref}" ]] || fail "GITHUB_REF is required to upload SARIF"
  [[ -f "${sarif_path}" ]] || fail "SARIF not found at ${sarif_path}"

  python3 - <<'PY'
import base64
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
    sarif_b64 = base64.b64encode(f.read()).decode("ascii")

payload = {
    "commit_sha": sha,
    "ref": ref,
    "sarif": sarif_b64,
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

with urllib.request.urlopen(req) as resp:
    if resp.status < 200 or resp.status >= 300:
        raise SystemExit(f"SARIF upload failed with status {resp.status}")
    body = resp.read().decode("utf-8")
    print(f"PS.SEMGREP: upload status={resp.status}")
    if body:
        print(body)
PY
}

SARIF_PATH="${output}" upload_sarif "${output}"

SEMGREP_FAIL_ON_FINDINGS_INPUT="${fail_on_findings}" \
  bash "${GITHUB_WORKSPACE}/tools/scripts/security/semgrep-enforce.sh"
