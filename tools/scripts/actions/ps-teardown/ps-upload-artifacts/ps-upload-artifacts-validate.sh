#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Upload Artifacts Validate
# ------------------------------------------------------------------------------
# Purpose:
#   Validate upload artifacts inputs.
# ==============================================================================


: "${PS_PLATFORM_ROOT:?PS_PLATFORM_ROOT must be set by the workflow (path to checked-out platform repo)}"
platform_root="${PS_PLATFORM_ROOT}"

if [[ ! -d "${platform_root}" ]]; then
  printf 'ERROR: PS_PLATFORM_ROOT directory not found: %s\n' "${platform_root}" >&2
  exit 1
fi

validate_sh="${platform_root}/tools/scripts/branding/validate-inputs.sh"
if [[ ! -f "${validate_sh}" ]]; then
  printf 'ERROR: validate-inputs.sh not found at %s\n' "${validate_sh}" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "${validate_sh}"

name="${PS_NAME:-}"
retention="${PS_RETENTION:-}"
nofiles="${PS_NOFILES:-}"
paths="${PS_PATHS:-}"
compression_level="${PS_COMPRESSION_LEVEL:-}"

require_nonempty "inputs.name" "${name}" || exit 1
require_nonempty "inputs.path" "${paths}" || exit 1

# Basic name safety: avoid weird characters that break tooling.
# Allow: letters, numbers, dot, underscore, dash.
require_regex \
  "inputs.name" \
  "${name}" \
  '^[A-Za-z0-9._-]+$' \
  "Allowed characters: A-Z a-z 0-9 . _ -" || exit 1

# retention_days must be a positive integer
require_positive_number "inputs.retention_days" "${retention}" || exit 1

# Validate if_no_files_found
require_enum "inputs.if_no_files_found" "${nofiles}" warn error ignore || exit 1

# Validate compression_level (0-9)
if ! require_number "inputs.compression_level" "${compression_level}"; then
  printf 'ERROR: inputs.compression_level must be a number 0-9. Got: %s\n' "${compression_level}" >&2
  exit 1
fi
if [[ ${compression_level} -lt 0 || ${compression_level} -gt 9 ]]; then
  printf 'ERROR: inputs.compression_level must be between 0 and 9. Got: %s\n' "${compression_level}" >&2
  exit 1
fi

printf 'PS.ARTIFACTS: name=%q\n' "$name"
printf 'PS.ARTIFACTS: retention_days=%q\n' "$retention"
printf 'PS.ARTIFACTS: if_no_files_found=%q\n' "$nofiles"
printf 'PS.ARTIFACTS: compression_level=%q\n' "$compression_level"
