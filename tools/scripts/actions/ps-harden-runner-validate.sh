#!/usr/bin/env bash
set -euo pipefail

egress_lc="$(printf '%s' "${PS_EGRESS_POLICY_INPUT:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ "${egress_lc}" != "audit" && "${egress_lc}" != "block" ]]; then
  printf 'ERROR: inputs.egress-policy must be one of audit|block. Got: %s\n' "${PS_EGRESS_POLICY_INPUT:-}" >&2
  exit 1
fi

printf 'PS.HARDEN: egress_policy=%s\n' "${egress_lc}"

printf 'PS_EGRESS_POLICY_VALIDATED=%s\n' "${egress_lc}" >> "${GITHUB_ENV}"
