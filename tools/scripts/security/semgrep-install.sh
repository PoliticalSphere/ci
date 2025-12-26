#!/usr/bin/env bash
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required to install Semgrep." >&2
  exit 1
fi

venv_dir="${GITHUB_WORKSPACE}/.tooling/venv/semgrep"
mkdir -p "$(dirname "${venv_dir}")"
python3 -m venv "${venv_dir}"

# shellcheck source=/dev/null
source "${venv_dir}/bin/activate"

python3 -m pip install --disable-pip-version-check --no-input --no-cache-dir \
  "semgrep==${SEMGREP_VERSION_INPUT}"

semgrep --version
