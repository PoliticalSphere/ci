#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Semgrep Input Validation
# ------------------------------------------------------------------------------
# Purpose:
#   Validate Semgrep inputs (version, output, policy flags, checksum).
#
# Dependencies:
#   - tools/scripts/core/validation.sh (includes core/path-validation.sh)
#
# Dependents:
#   - tools/scripts/runners/security/semgrep/cli.sh
# ==============================================================================
set -euo pipefail

# Resolve platform root deterministically.
platform_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE}/.ps-platform}"
if [[ ! -d "${platform_root}" ]]; then
  printf 'ERROR: platform_root not found: %s\n' "${platform_root}" >&2
  printf 'HINT: export PS_PLATFORM_ROOT or checkout platform into .ps-platform.\n' >&2
  exit 1
fi

# shellcheck source=tools/scripts/core/validation.sh
. "${platform_root}/tools/scripts/core/validation.sh"
# Note: path.sh is now sourced via validation.sh

repo_root="${GITHUB_WORKSPACE:-$(pwd)}"

check_under_root() {
  local target="$1"
  local resolved
  resolved="$(resolve_abs_path "${target}")" || {
    v_error "path resolver missing for security check: ${target}"
    exit 1
  }
  case "${resolved}" in
    "${repo_root}"|${repo_root}/*) return 0 ;;
    *)
      v_error "path escape detected: ${target} resolves outside workspace"
      exit 1
      ;;
  esac
}

version="${SEMGREP_VERSION_INPUT:-}"
fail_on_findings="${SEMGREP_FAIL_ON_FINDINGS_INPUT:-}"
checksum="${SEMGREP_SHA256_INPUT:-}"
config="${SEMGREP_CONFIG_INPUT:-}"
scan_path="${SEMGREP_PATH_INPUT:-.}"
allow_unverified="${SEMGREP_ALLOW_UNVERIFIED_INPUT:-${SEMGREP_ALLOW_UNVERIFIED:-false}}"

require_nonempty "inputs.version" "${version}" || exit 1
require_regex \
  "inputs.version" \
  "${version}" \
  '^[0-9]+\.[0-9]+\.[0-9]+$' \
  "Use a pinned SemVer like 1.461.0." || exit 1

require_enum "inputs.fail_on_findings" "${fail_on_findings}" true false || exit 1

case "$(printf '%s' "${allow_unverified}" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|y|on) allow_unverified="true" ;;
  0|false|no|n|off|"") allow_unverified="false" ;;
  *)
    v_error "inputs.semgrep_allow_unverified must be true|false (got: ${allow_unverified})"
    exit 1
    ;;
esac

# Config validation: allow registry refs or safe repo-relative paths.
require_nonempty "inputs.config" "${config}" || exit 1
if [[ "${config}" =~ ^[pr]/[A-Za-z0-9._-]+$ ]]; then
  :
else
  safe_relpath "${config}" || { v_error "inputs.config must be repo-relative without traversal (got: ${config})"; exit 1; }
  config_abs="${repo_root}/${config}"
  check_under_root "${config_abs}"
  if [[ ! -f "${config_abs}" ]]; then
    v_error "inputs.config file not found: ${config}"
    exit 1
  fi
fi

# Scan path validation (must be a directory under the repo root).
safe_relpath "${scan_path}" || { v_error "inputs.path must be repo-relative without traversal (got: ${scan_path})"; exit 1; }
scan_abs="${repo_root}/${scan_path}"
check_under_root "${scan_abs}"
if [[ ! -d "${scan_abs}" ]]; then
  v_error "inputs.path directory not found: ${scan_path}"
  exit 1
fi

# Optional checksum validation (sha256 hex)
if [[ -n "${checksum}" ]]; then
  require_regex \
    "inputs.semgrep_sha256" \
    "${checksum}" \
    '^[a-fA-F0-9]{64}$' \
    "Use a 64-character SHA-256 hex string." || exit 1
fi

if [[ ( "${CI:-}" == "1" || "${CI:-}" == "true" ) && -z "${checksum}" && "${allow_unverified}" != "true" ]]; then
  v_error "inputs.semgrep_sha256 is required in CI (set semgrep_sha256 or semgrep_allow_unverified=true)"
  exit 1
fi

# Basic output sanity (avoid empty / weird values).
out="${SEMGREP_OUTPUT_INPUT:-}"
require_nonempty "inputs.output" "${out}" || exit 1
out_abs="${out}"
if [[ "${out_abs}" != /* ]]; then
  out_abs="${repo_root}/${out_abs}"
fi
check_under_root "${out_abs}"
out_dir="$(dirname "${out_abs}")"
mkdir -p "${out_dir}"
if [[ ! -w "${out_dir}" ]]; then
  v_error "inputs.output directory not writable: ${out_dir}"
  exit 1
fi

printf 'PS.SEMGREP: version=%q\n' "$version"
printf 'PS.SEMGREP: config=%q\n' "${SEMGREP_CONFIG_INPUT:-}"
printf 'PS.SEMGREP: path=%q\n' "${SEMGREP_PATH_INPUT:-}"
printf 'PS.SEMGREP: output=%q\n' "$out"
if [[ -n "${checksum}" ]]; then
  printf 'PS.SEMGREP: sha256=%q\n' "$checksum"
fi
printf 'PS.SEMGREP: fail_on_findings=%q\n' "$fail_on_findings"
printf 'PS.SEMGREP: allow_unverified=%q\n' "$allow_unverified"
