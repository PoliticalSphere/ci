#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Harden Runner Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate harden-runner inputs.
# ==============================================================================

# shellcheck source=tools/scripts/core/gha-helpers.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/gha-helpers.sh"
# shellcheck source=tools/scripts/core/validation.sh
. "${GITHUB_WORKSPACE}/tools/scripts/core/validation.sh"
# shellcheck source=tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh
. "${GITHUB_WORKSPACE}/tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh"

egress="$(require_enum "inputs.egress-policy" "${PS_EGRESS_POLICY_INPUT:-}" audit block)"

printf 'PS.HARDEN: egress_policy=%s\n' "${egress}"

emit_env "PS_EGRESS_POLICY_VALIDATED" "${egress}"

exit 0
