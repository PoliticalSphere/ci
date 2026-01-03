#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Toolchain Installer
# ------------------------------------------------------------------------------
# Purpose:
#   Install pinned CLI tools for CI gates (lint/security) using tooling.env.
#   Tools must be installed as real binaries inside install_dir (no external symlinks).
#
# Usage:
#   install-tools.sh <tool> [<tool> ...]
#
# Supported tools:
#   actionlint | shellcheck | hadolint | yamllint | gitleaks | trivy
# ============================================================================== 

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

if [[ -f "${REPO_ROOT}/tools/scripts/egress.sh" ]]; then
  # shellcheck source=tools/scripts/egress.sh
  . "${REPO_ROOT}/tools/scripts/egress.sh"
  load_egress_allowlist || fail "egress allowlist load failed"
fi

tooling_env="${REPO_ROOT}/configs/security/tooling.env"
if [[ ! -f "${tooling_env}" ]]; then
  fail "tooling config missing at ${tooling_env}"
fi

if [[ "${RUNNER_OS:-}" != "Linux" ]]; then
  fail "install-tools supports Linux runners only."
fi

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) return 1 ;;
  esac
}

ARCH="$(detect_arch)" || fail "unsupported architecture: $(uname -m)"

ACTIONLINT_ARCH="${ARCH}"
SHELLCHECK_ARCH="$([[ "${ARCH}" == "amd64" ]] && echo "x86_64" || echo "aarch64")"
HADOLINT_ARCH="$([[ "${ARCH}" == "amd64" ]] && echo "x86_64" || echo "arm64")"
GITLEAKS_ARCH="$([[ "${ARCH}" == "amd64" ]] && echo "x64" || echo "arm64")"
TRIVY_ARCH="$([[ "${ARCH}" == "amd64" ]] && echo "64bit" || echo "ARM64")"

if [[ "${#}" -eq 0 ]]; then
  fail "install-tools requires at least one tool name."
fi

curl_secure() {
  local url="$1"
  shift
  if [[ -z "${url}" ]]; then
    fail "curl_secure requires a URL"
  fi
  if [[ "${url}" != https://* ]]; then
    fail "refusing non-HTTPS URL: ${url}"
  fi
  if declare -F assert_egress_allowed_url >/dev/null 2>&1; then
    assert_egress_allowed_url "${url}"
  fi
  curl --proto '=https' --tlsv1.2 -fsSL "${url}" "$@"
  return 0
}

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    fail "${name} is required in tooling.env"
  fi

  return 0
} 

set -a
# shellcheck source=/dev/null
. "${tooling_env}"
set +a

install_dir="${PS_INSTALL_DIR:-${GITHUB_WORKSPACE:-$(pwd)}/.tooling/bin}"
mkdir -p "${install_dir}"

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "${install_dir}" >> "${GITHUB_PATH}"
  # For pip --user installs (yamllint)
  printf '%s\n' "${HOME}/.local/bin" >> "${GITHUB_PATH}"
else
  export PATH="${install_dir}:${HOME}/.local/bin:${PATH}"
fi

# Shared temp directory
_tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${_tmpdir}"; 
  return 0
}
trap cleanup EXIT

install_actionlint() {
  detail "PS.INSTALL: actionlint=${ACTIONLINT_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var ACTIONLINT_VERSION
  local actionlint_sha=""
  if [[ "${ARCH}" == "arm64" ]]; then
    require_var ACTIONLINT_SHA256_ARM64
    actionlint_sha="${ACTIONLINT_SHA256_ARM64}"
  else
    require_var ACTIONLINT_SHA256
    actionlint_sha="${ACTIONLINT_SHA256}"
  fi
  curl_secure "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_${ACTIONLINT_ARCH}.tar.gz" \
    -o "${_tmpdir}/actionlint.tar.gz"
  printf '%s\n' "${actionlint_sha}  ${_tmpdir}/actionlint.tar.gz" | sha256sum -c -
  tar -xzf "${_tmpdir}/actionlint.tar.gz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/actionlint" "${install_dir}/actionlint"

  return 0
} 

install_shellcheck() {
  detail "PS.INSTALL: shellcheck=${SHELLCHECK_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var SHELLCHECK_VERSION
  local shellcheck_sha=""
  if [[ "${ARCH}" == "arm64" ]]; then
    require_var SHELLCHECK_SHA256_ARM64
    shellcheck_sha="${SHELLCHECK_SHA256_ARM64}"
  else
    require_var SHELLCHECK_SHA256
    shellcheck_sha="${SHELLCHECK_SHA256}"
  fi
  curl_secure "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.linux.${SHELLCHECK_ARCH}.tar.xz" \
    -o "${_tmpdir}/shellcheck.tar.xz"
  printf '%s\n' "${shellcheck_sha}  ${_tmpdir}/shellcheck.tar.xz" | sha256sum -c -
  tar -xJf "${_tmpdir}/shellcheck.tar.xz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/shellcheck-v${SHELLCHECK_VERSION}/shellcheck" "${install_dir}/shellcheck"

  return 0
} 

install_hadolint() {
  detail "PS.INSTALL: hadolint=${HADOLINT_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var HADOLINT_VERSION
  local hadolint_sha=""
  if [[ "${ARCH}" == "arm64" ]]; then
    require_var HADOLINT_SHA256_ARM64
    hadolint_sha="${HADOLINT_SHA256_ARM64}"
  else
    require_var HADOLINT_SHA256
    hadolint_sha="${HADOLINT_SHA256}"
  fi
  curl_secure "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-${HADOLINT_ARCH}" \
    -o "${_tmpdir}/hadolint"
  printf '%s\n' "${hadolint_sha}  ${_tmpdir}/hadolint" | sha256sum -c -
  install -m 0755 "${_tmpdir}/hadolint" "${install_dir}/hadolint"

  return 0
} 

install_yamllint() {
  detail "PS.INSTALL: yamllint=${YAMLLINT_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var YAMLLINT_VERSION
  require_var YAMLLINT_SHA256
  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 is required to install yamllint."
    exit 1
  fi

  local wheel_url=""
  wheel_url="$(
    curl_secure "https://pypi.org/pypi/yamllint/${YAMLLINT_VERSION}/json" | \
      python3 -c "import json,sys; response_doc=json.load(sys.stdin); urls=response_doc['urls']; wheel=next(u for u in urls if u['packagetype']=='bdist_wheel' and u['filename'].endswith('py3-none-any.whl')); print(wheel['url'])" || true
  )"
  if [[ -z "${wheel_url}" ]]; then
    fail "failed to resolve yamllint wheel URL (check network/PyPI availability)."
    exit 1
  fi
  local wheel_name=""
  local wheel_path=""
  wheel_name="$(basename "${wheel_url}")"
  wheel_path="${_tmpdir}/${wheel_name}"

  if ! curl_secure "${wheel_url}" -o "${wheel_path}"; then
    fail "failed to download yamllint wheel from PyPI."
    exit 1
  fi
  printf '%s\n' "${YAMLLINT_SHA256}  ${wheel_path}" | sha256sum -c -

  python3 -m pip install \
    --disable-pip-version-check \
    --no-input \
    --no-cache-dir \
    --user \
    --no-deps \
    "${wheel_path}"

  return 0
}

install_gitleaks() {
  detail "PS.INSTALL: gitleaks=${GITLEAKS_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var GITLEAKS_VERSION
  local gitleaks_sha=""
  if [[ "${ARCH}" == "arm64" ]]; then
    require_var GITLEAKS_SHA256_ARM64
    gitleaks_sha="${GITLEAKS_SHA256_ARM64}"
  else
    require_var GITLEAKS_SHA256
    gitleaks_sha="${GITLEAKS_SHA256}"
  fi
  curl_secure "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GITLEAKS_ARCH}.tar.gz" \
    -o "${_tmpdir}/gitleaks.tar.gz"
  printf '%s\n' "${gitleaks_sha}  ${_tmpdir}/gitleaks.tar.gz" | sha256sum -c -
  tar -xzf "${_tmpdir}/gitleaks.tar.gz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/gitleaks" "${install_dir}/gitleaks"

  return 0
} 

install_trivy() {
  detail "PS.INSTALL: trivy=${TRIVY_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var TRIVY_VERSION
  local trivy_sha=""
  if [[ "${ARCH}" == "arm64" ]]; then
    require_var TRIVY_SHA256_ARM64
    trivy_sha="${TRIVY_SHA256_ARM64}"
  else
    require_var TRIVY_SHA256
    trivy_sha="${TRIVY_SHA256}"
  fi
  curl_secure "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TRIVY_ARCH}.tar.gz" \
    -o "${_tmpdir}/trivy.tar.gz"
  printf '%s\n' "${trivy_sha}  ${_tmpdir}/trivy.tar.gz" | sha256sum -c -
  tar -xzf "${_tmpdir}/trivy.tar.gz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/trivy" "${install_dir}/trivy"

  return 0
} 

for tool in "$@"; do
  case "${tool}" in
    actionlint) install_actionlint ;;
    shellcheck) install_shellcheck ;;
    hadolint) install_hadolint ;;
    yamllint) install_yamllint ;;
    gitleaks) install_gitleaks ;;
    trivy) install_trivy ;;
    *)
      fail "unknown tool '${tool}'."
      exit 1
      ;;
  esac
done

detail "PS.INSTALL: OK"
