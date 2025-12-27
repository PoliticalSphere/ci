#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Validate Paths
# ------------------------------------------------------------------------------
# Purpose:
#   Validate repo-relative path inputs.
# ==============================================================================


fail() {
  echo "ERROR: $*" >&2
  # If the script is being sourced, return so the caller can handle the error.
  # If the script is being executed directly, exit to stop the process.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  else
    exit 1
  fi
}

# Basic non-empty validation
[[ -n "${WD:-}" ]] || fail "working-directory must not be empty"
[[ -n "${SCRIPT:-}" ]] || fail "script must not be empty"

# No absolute paths
if [[ "${WD}" = /* ]]; then
  fail "working-directory must be repo-relative, not absolute: ${WD}"
fi
if [[ "${SCRIPT}" = /* ]]; then
  fail "script must be repo-relative, not absolute: ${SCRIPT}"
fi

# No path traversal
if [[ "${WD}" == *".."* ]]; then
  fail "working-directory must not contain '..': ${WD}"
fi
if [[ "${SCRIPT}" == *".."* ]]; then
  fail "script must not contain '..': ${SCRIPT}"
fi

# Existence checks in the workspace (GITHUB_WORKSPACE bound by runner)
if [[ ! -d "${GITHUB_WORKSPACE}/${WD}" ]]; then
  fail "working-directory not found: ${WD}"
fi
if [[ ! -f "${GITHUB_WORKSPACE}/${SCRIPT}" ]]; then
  fail "script not found: ${SCRIPT}"
fi

printf 'OK: inputs validated (working-directory=%s, script=%s)\n' "${WD}" "${SCRIPT}"
