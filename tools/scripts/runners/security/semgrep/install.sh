#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Semgrep Installer
# ------------------------------------------------------------------------------
# Purpose:
#   Install pinned Semgrep into a dedicated virtual environment, with optional
#   SHA-256 verification for the package artifact.
#
# Dependencies:
#   - python3
#   - pip (via python3 -m pip)
#
# Dependents:
#   - tools/scripts/runners/security/semgrep/cli.sh
# ==============================================================================
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../../core/base-helpers.sh"
init_repo_context

if [[ -f "${REPO_ROOT}/tools/scripts/egress.sh" ]]; then
  # shellcheck source=tools/scripts/egress.sh
  . "${REPO_ROOT}/tools/scripts/egress.sh"
  load_egress_allowlist || fail "egress allowlist load failed"
fi

require_cmd python3

workspace_root="${GITHUB_WORKSPACE:-${REPO_ROOT}}"
venv_dir="${workspace_root}/.tooling/venv/semgrep"
mkdir -p "$(dirname "${venv_dir}")"
python3 -m venv "${venv_dir}"

# shellcheck source=/dev/null
source "${venv_dir}/bin/activate"

if declare -F assert_egress_allowed_url >/dev/null 2>&1; then
  pip_index="${PIP_INDEX_URL:-https://pypi.org/simple}"
  assert_egress_allowed_url "${pip_index}"
  if [[ -n "${PIP_EXTRA_INDEX_URL:-}" ]]; then
    for extra in ${PIP_EXTRA_INDEX_URL}; do
      assert_egress_allowed_url "${extra}"
    done
  fi
fi

checksum="${SEMGREP_SHA256_INPUT:-}"
if [[ -n "${checksum}" ]]; then
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "${tmp_dir}"' EXIT
  python3 -m pip download --disable-pip-version-check --no-input --no-cache-dir \
    --no-deps --dest "${tmp_dir}" "semgrep==${SEMGREP_VERSION_INPUT}"

  pkg=""
  for f in "${tmp_dir}"/*.whl; do
    if [[ -f "${f}" ]]; then
      pkg="${f}"
      break
    fi
  done
  if [[ -z "${pkg}" ]]; then
    for f in "${tmp_dir}"/*; do
      if [[ -f "${f}" ]]; then
        pkg="${f}"
        break
      fi
    done
  fi
  [[ -n "${pkg}" ]] || fail "failed to download Semgrep artifact for checksum verification."

  actual_hash="$(python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "${pkg}")"
  expected_hash="$(printf '%s' "${checksum}" | tr '[:upper:]' '[:lower:]')"
  actual_hash="$(printf '%s' "${actual_hash}" | tr '[:upper:]' '[:lower:]')"

  if [[ "${actual_hash}" != "${expected_hash}" ]]; then
    fail "Semgrep checksum mismatch (expected ${expected_hash}, got ${actual_hash})"
  fi

  python3 -m pip install --disable-pip-version-check --no-input --no-cache-dir \
    --no-deps "${pkg}"
  trap - EXIT
  rm -rf "${tmp_dir}"
else
  python3 -m pip install --disable-pip-version-check --no-input --no-cache-dir \
    "semgrep==${SEMGREP_VERSION_INPUT}"
fi

semgrep --version
