#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Toolchain Installer
# ------------------------------------------------------------------------------
# Purpose:
#   Install pinned CLI tools for CI gates (lint/security) using tooling.env.
#
# Usage:
#   install-tools.sh <tool> [<tool> ...]
#
# Supported tools:
#   actionlint | shellcheck | hadolint | yamllint | gitleaks | trivy
# ============================================================================== 

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  repo_root="${GITHUB_WORKSPACE:-$(pwd)}"
fi
format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

detail() {
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    echo "$*"
  fi
}

error() {
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    echo "ERROR: $*" >&2
  fi
}

tooling_env="${repo_root}/configs/security/tooling.env"
if [[ ! -f "${tooling_env}" ]]; then
  error "tooling config missing at ${tooling_env}"
  exit 1
fi

if [[ "${RUNNER_OS:-}" != "Linux" ]]; then
  error "install-tools supports Linux runners only."
  exit 1
fi

if [[ "${#}" -eq 0 ]]; then
  error "install-tools requires at least one tool name."
  exit 1
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    error "${cmd} is required but not found on PATH"
    exit 1
  fi
}

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    error "${name} is required in tooling.env"
    exit 1
  fi
}

set -a
# shellcheck source=/dev/null
. "${tooling_env}"
set +a

install_dir="${PS_INSTALL_DIR:-${GITHUB_WORKSPACE:-$(pwd)}/.tooling/bin}"
mkdir -p "${install_dir}"

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "${install_dir}" >> "${GITHUB_PATH}"
  # For pip --user installs (yamllint)
  echo "${HOME}/.local/bin" >> "${GITHUB_PATH}"
else
  export PATH="${install_dir}:${HOME}/.local/bin:${PATH}"
fi

# Shared temp directory
_tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${_tmpdir}"; }
trap cleanup EXIT

install_actionlint() {
  detail "PS.INSTALL: actionlint=${ACTIONLINT_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var ACTIONLINT_VERSION
  require_var ACTIONLINT_SHA256
  curl -fsSL -o "${_tmpdir}/actionlint.tar.gz" \
    "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"
  echo "${ACTIONLINT_SHA256}  ${_tmpdir}/actionlint.tar.gz" | sha256sum -c -
  tar -xzf "${_tmpdir}/actionlint.tar.gz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/actionlint" "${install_dir}/actionlint"
}

install_shellcheck() {
  detail "PS.INSTALL: shellcheck=${SHELLCHECK_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var SHELLCHECK_VERSION
  require_var SHELLCHECK_SHA256
  curl -fsSL -o "${_tmpdir}/shellcheck.tar.xz" \
    "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.linux.x86_64.tar.xz"
  echo "${SHELLCHECK_SHA256}  ${_tmpdir}/shellcheck.tar.xz" | sha256sum -c -
  tar -xJf "${_tmpdir}/shellcheck.tar.xz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/shellcheck-v${SHELLCHECK_VERSION}/shellcheck" "${install_dir}/shellcheck"
}

install_hadolint() {
  detail "PS.INSTALL: hadolint=${HADOLINT_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var HADOLINT_VERSION
  require_var HADOLINT_SHA256
  curl -fsSL -o "${_tmpdir}/hadolint" \
    "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-x86_64"
  echo "${HADOLINT_SHA256}  ${_tmpdir}/hadolint" | sha256sum -c -
  install -m 0755 "${_tmpdir}/hadolint" "${install_dir}/hadolint"
}

install_yamllint() {
  detail "PS.INSTALL: yamllint=${YAMLLINT_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var YAMLLINT_VERSION
  require_var YAMLLINT_SHA256
  if ! command -v python3 >/dev/null 2>&1; then
    error "python3 is required to install yamllint."
    exit 1
  fi

  wheel_url="$(
    curl -fsSL "https://pypi.org/pypi/yamllint/${YAMLLINT_VERSION}/json" | \
      python3 -c "import json,sys; data=json.load(sys.stdin); urls=data['urls']; wheel=next(u for u in urls if u['packagetype']=='bdist_wheel' and u['filename'].endswith('py3-none-any.whl')); print(wheel['url'])" || true
  )"
  if [[ -z "${wheel_url}" ]]; then
    error "failed to resolve yamllint wheel URL (check network/PyPI availability)."
    exit 1
  fi
  wheel_name="$(basename "${wheel_url}")"
  wheel_path="${_tmpdir}/${wheel_name}"

  if ! curl -fsSL -o "${wheel_path}" "${wheel_url}"; then
    error "failed to download yamllint wheel from PyPI."
    exit 1
  fi
  echo "${YAMLLINT_SHA256}  ${wheel_path}" | sha256sum -c -

  python3 -m pip install \
    --disable-pip-version-check \
    --no-input \
    --no-cache-dir \
    --user \
    --no-deps \
    "${wheel_path}"
}

install_gitleaks() {
  detail "PS.INSTALL: gitleaks=${GITLEAKS_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var GITLEAKS_VERSION
  require_var GITLEAKS_SHA256
  curl -fsSL -o "${_tmpdir}/gitleaks.tar.gz" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
  echo "${GITLEAKS_SHA256}  ${_tmpdir}/gitleaks.tar.gz" | sha256sum -c -
  tar -xzf "${_tmpdir}/gitleaks.tar.gz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/gitleaks" "${install_dir}/gitleaks"
}

install_trivy() {
  detail "PS.INSTALL: trivy=${TRIVY_VERSION}"
  require_cmd curl
  require_cmd sha256sum
  require_var TRIVY_VERSION
  require_var TRIVY_SHA256
  curl -fsSL -o "${_tmpdir}/trivy.tar.gz" \
    "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
  echo "${TRIVY_SHA256}  ${_tmpdir}/trivy.tar.gz" | sha256sum -c -
  tar -xzf "${_tmpdir}/trivy.tar.gz" -C "${_tmpdir}"
  install -m 0755 "${_tmpdir}/trivy" "${install_dir}/trivy"
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
      error "unknown tool '${tool}'."
      exit 1
      ;;
  esac
done

detail "PS.INSTALL: OK"
