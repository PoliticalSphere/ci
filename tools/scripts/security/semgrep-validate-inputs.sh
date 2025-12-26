#!/usr/bin/env bash
set -euo pipefail

# Resolve platform root deterministically.
platform_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE}/.ps-platform}"
if [[ ! -d "${platform_root}" ]]; then
  printf 'ERROR: platform_root not found: %s\n' "${platform_root}" >&2
  printf 'HINT: export PS_PLATFORM_ROOT or checkout platform into .ps-platform.\n' >&2
  exit 1
fi

validate_sh="${platform_root}/tools/scripts/branding/validate-inputs.sh"
if [[ ! -f "${validate_sh}" ]]; then
  printf 'ERROR: validate-inputs.sh not found at %s\n' "${validate_sh}" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${validate_sh}"

version="${SEMGREP_VERSION_INPUT:-}"
fail_on_findings="${SEMGREP_FAIL_ON_FINDINGS_INPUT:-}"

require_nonempty "inputs.version" "${version}" || exit 1
require_regex \
  "inputs.version" \
  "${version}" \
  '^[0-9]+\.[0-9]+\.[0-9]+$' \
  "Use a pinned SemVer like 1.461.0." || exit 1

require_enum "inputs.fail_on_findings" "${fail_on_findings}" true false || exit 1

# Basic output sanity (avoid empty / weird values).
out="${SEMGREP_OUTPUT_INPUT:-}"
require_nonempty "inputs.output" "${out}" || exit 1

printf 'PS.SEMGREP: version=%q\n' "$version"
printf 'PS.SEMGREP: config=%q\n' "${SEMGREP_CONFIG_INPUT:-}"
printf 'PS.SEMGREP: path=%q\n' "${SEMGREP_PATH_INPUT:-}"
printf 'PS.SEMGREP: output=%q\n' "$out"
printf 'PS.SEMGREP: fail_on_findings=%q\n' "$fail_on_findings"
