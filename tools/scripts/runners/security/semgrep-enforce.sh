#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Semgrep Enforcement
# ------------------------------------------------------------------------------
# Purpose:
#   Enforce Semgrep exit policy based on findings and configured flags.
#
# Dependencies:
#   - .semgrep-exit-code.txt (written by semgrep-scan.sh)
#
# Dependents:
#   - tools/scripts/runners/security/semgrep-cli.sh
# ==============================================================================
set -euo pipefail

semgrep_exit="$(cat "${GITHUB_WORKSPACE}/.semgrep-exit-code.txt" 2>/dev/null || echo 2)"

if [[ "${semgrep_exit}" -gt 1 ]]; then
  printf "ERROR: Semgrep failed with exit code %s\n" "${semgrep_exit}" >&2
  exit "${semgrep_exit}"
fi

if [[ "${semgrep_exit}" -eq 1 && "${SEMGREP_FAIL_ON_FINDINGS_INPUT:-}" == "true" ]]; then
  printf "ERROR: Semgrep reported findings (exit 1).\n" >&2
  exit 1
fi

printf 'PS.SEMGREP: completed (exit %s).\n' "${semgrep_exit}"
printf 'PS.SEMGREP: OK\n'
