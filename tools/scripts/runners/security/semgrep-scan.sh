#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Semgrep Scan
# ------------------------------------------------------------------------------
# Purpose:
#   Run Semgrep with configured inputs and emit SARIF output + exit code.
#
# Dependencies:
#   - .tooling/venv/semgrep (installed by semgrep-install.sh)
#
# Dependents:
#   - tools/scripts/runners/security/semgrep-cli.sh
# ==============================================================================
set -euo pipefail

repo_root="${GITHUB_WORKSPACE:-$(pwd)}"

# shellcheck source=/dev/null
source "${repo_root}/.tooling/venv/semgrep/bin/activate"

out="${SEMGREP_OUTPUT_INPUT:-}"
if [[ "${out}" != /* ]]; then
  out="${repo_root}/${out}"
fi
out_dir="$(dirname "${out}")"
mkdir -p "${out_dir}"

semgrep_exit=0
semgrep \
  --metrics=off \
  --timeout 30 \
  --config="${SEMGREP_CONFIG_INPUT:-}" \
  --sarif \
  --output "${out}" \
  "${SEMGREP_PATH_INPUT:-}" \
  || semgrep_exit=$?

# Semgrep exit codes:
# 0 = no findings
# 1 = findings
# >1 = error
printf '%s\n' "${semgrep_exit}" > "${repo_root}/.semgrep-exit-code.txt"

if [[ ! -f "${out}" ]]; then
  printf "ERROR: SARIF output not found at '%s'.\n" "${out}" >&2
  printf "HINT: semgrep exited with code %s and did not produce SARIF.\n" "${semgrep_exit}" >&2
  exit 1
fi

printf 'PS.SEMGREP: sarif=%q\n' "$out"
printf 'PS.SEMGREP: exit=%q\n' "${semgrep_exit}"
