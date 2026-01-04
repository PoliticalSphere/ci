#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Semgrep CLI Orchestrator
# ------------------------------------------------------------------------------
# Purpose:
#   Validate inputs, install Semgrep, run scan, and enforce policy with SARIF.
#
# Dependencies:
#   - tools/scripts/core/error-handler.sh
#   - tools/scripts/runners/security/semgrep/validate-inputs.sh
#   - tools/scripts/runners/security/semgrep/install.sh
#   - tools/scripts/runners/security/semgrep/scan.sh
#   - tools/scripts/runners/security/semgrep/enforce.sh
#
# Dependents:
#   - ./.github/actions/ps-task/semgrep-cli
# ==============================================================================
set -euo pipefail

repo_root="${GITHUB_WORKSPACE:-$(pwd)}"

# Source shared fail helper first
# shellcheck source=tools/scripts/core/error-handler.sh
. "${repo_root}/tools/scripts/core/error-handler.sh"

if [[ -f "${repo_root}/tools/scripts/egress.sh" ]]; then
  # shellcheck source=tools/scripts/egress.sh
  . "${repo_root}/tools/scripts/egress.sh"
  load_egress_allowlist || fail "egress allowlist load failed"
fi

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

bash "${GITHUB_WORKSPACE}/tools/scripts/runners/security/semgrep-validate-inputs.sh"

bash "${GITHUB_WORKSPACE}/tools/scripts/runners/security/semgrep-install.sh"

installed_version="$(semgrep --version | sed -E 's/[^0-9]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/' | head -n1)"
if [[ -z "${installed_version}" ]]; then
  fail "Semgrep version check failed (no version output)."
fi
if [[ "${installed_version}" != "${SEMGREP_VERSION_INPUT}" ]]; then
  fail "Semgrep version mismatch (expected ${SEMGREP_VERSION_INPUT}, got ${installed_version})."
fi

# Source SARIF upload utility
# shellcheck source=tools/scripts/runners/security/sarif-upload.sh
. "${repo_root}/tools/scripts/runners/security/sarif-upload.sh"

rm -f "${GITHUB_WORKSPACE}/.semgrep-exit-code.txt"

SEMGREP_SEND_METRICS=off \
  bash "${GITHUB_WORKSPACE}/tools/scripts/runners/security/semgrep-scan.sh"

sarif_path="${output}"
if [[ "${sarif_path}" != /* ]]; then
  sarif_path="${GITHUB_WORKSPACE}/${sarif_path}"
fi
SARIF_PATH="${sarif_path}" upload_sarif "${sarif_path}"

SEMGREP_FAIL_ON_FINDINGS_INPUT="${fail_on_findings}" \
  bash "${GITHUB_WORKSPACE}/tools/scripts/runners/security/semgrep-enforce.sh"
