#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Validate Paths
# ------------------------------------------------------------------------------
# Purpose:
#   Validate repo-relative path inputs.
# ==============================================================================


fail() { echo "ERROR: $*" >&2; exit 1; return 1; }

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
