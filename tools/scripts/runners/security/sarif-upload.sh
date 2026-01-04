#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — SARIF Upload Utility
# ------------------------------------------------------------------------------
# Purpose:
#   Upload SARIF files to GitHub Code Scanning API.
#   Reusable by any security scanner that produces SARIF output.
#
# Usage:
#   source sarif-upload.sh
#   upload_sarif "/path/to/results.sarif"
#
# Environment Requirements:
#   GITHUB_TOKEN       - Token with code-scanning write permission
#   GITHUB_REPOSITORY  - owner/repo format
#   GITHUB_SHA         - Commit SHA to associate results with
#   GITHUB_REF         - Branch/tag ref
#   GITHUB_API_URL     - (optional) API URL, defaults to https://api.github.com
#
# Dependencies:
#   - python3 (for gzip compression and API call)
#   - fail() function from error-handler.sh
#   - assert_egress_allowed_url() (optional, from egress.sh)
#
# Sourced by:
#   - tools/scripts/runners/security/semgrep/cli.sh
#   - (future) Other security tools producing SARIF
# ==============================================================================
[[ -n "${_PS_SARIF_UPLOAD_LOADED:-}" ]] && return 0
_PS_SARIF_UPLOAD_LOADED=1

# Ensure fail() is available
if ! declare -F fail >/dev/null 2>&1; then
  fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
  }
  return 0
fi

# upload_sarif <sarif_path>
# Upload a SARIF file to GitHub Code Scanning API
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

  # Check egress if available
  if declare -F assert_egress_allowed_url >/dev/null 2>&1; then
    assert_egress_allowed_url "${api_url}"
  fi

  # Export for Python script
  export SARIF_PATH="${sarif_path}"
  export GITHUB_TOKEN="${token}"
  export GITHUB_REPOSITORY="${repo}"
  export GITHUB_SHA="${sha}"
  export GITHUB_REF="${ref}"
  export GITHUB_API_URL="${api_url}"

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

payload_bytes = json.dumps(payload).encode("utf-8")
url = f"{api_url}/repos/{repo}/code-scanning/sarifs"
req = urllib.request.Request(
    url,
    data=payload_bytes,
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
        resp.read()
        print(f"PS.SARIF: upload status={resp.status}")
except Exception as exc:
    raise SystemExit(f"SARIF upload failed: {exc}") from exc
PY
  return 0
}
