#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Checkout Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate checkout inputs.
# ==============================================================================


fetch_depth="${PS_FETCH_DEPTH_INPUT:-1}"

if ! printf '%s' "${fetch_depth}" | grep -Eq '^[0-9]+$'; then
  printf 'ERROR: inputs.fetch_depth must be a non-negative integer. Got: %s\n' "${fetch_depth}" >&2
  exit 1
fi

printf 'PS.CHECKOUT: fetch_depth=%s ref=%s\n' "${fetch_depth}" "${PS_REF_INPUT:-<default>}"

printf 'PS_FETCH_DEPTH_VALIDATED=%s\n' "${fetch_depth}" >> "${GITHUB_ENV}"
