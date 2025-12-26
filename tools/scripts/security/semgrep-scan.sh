#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source "${GITHUB_WORKSPACE}/.tooling/venv/semgrep/bin/activate"

out="${SEMGREP_OUTPUT_INPUT:-}"
out_dir="$(dirname "${out}")"
mkdir -p "${out_dir}"

semgrep_exit=0
semgrep \
  --metrics=off \
  --config="${SEMGREP_CONFIG_INPUT:-}" \
  --sarif \
  --output "${out}" \
  "${SEMGREP_PATH_INPUT:-}" \
  || semgrep_exit=$?

# Semgrep exit codes:
# 0 = no findings
# 1 = findings
# >1 = error
printf '%s\n' "${semgrep_exit}" > "${GITHUB_WORKSPACE}/.semgrep-exit-code.txt"

if [[ ! -f "${out}" ]]; then
  printf "ERROR: SARIF output not found at '%s'.\n" "${out}" >&2
  printf "HINT: semgrep exited with code %s and did not produce SARIF.\n" "${semgrep_exit}" >&2
  exit 1
fi

printf 'PS.SEMGREP: sarif=%q\n' "$out"
printf 'PS.SEMGREP: exit=%q\n' "${semgrep_exit}"
