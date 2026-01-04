#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Bootstrap Prepare Tools
# ------------------------------------------------------------------------------
# Purpose:
#   Prepare tool inputs and environment for bootstrap.
# ==============================================================================


scripts_root="${PS_PLATFORM_ROOT:-${GITHUB_WORKSPACE}}"
# shellcheck source=tools/scripts/core/validation.sh
. "${scripts_root}/tools/scripts/core/validation.sh"

require_enum "inputs.tools_bundle" "${PS_TOOLS_BUNDLE_INPUT}" "lint" "security" "none" || exit 1

tools_list=""
if [[ "${PS_TOOLS_BUNDLE_INPUT}" == "lint" ]]; then
  tools_list=$'actionlint\nshellcheck\nhadolint\nyamllint'
elif [[ "${PS_TOOLS_BUNDLE_INPUT}" == "security" ]]; then
  tools_list=$'gitleaks'
fi

PS_TOOLS_EXTRA_INPUT_TRIMMED="$(printf '%s' "${PS_TOOLS_EXTRA_INPUT}" | sed 's/^\s*//; s/\s*$//')"
if [[ -n "${PS_TOOLS_EXTRA_INPUT_TRIMMED}" ]]; then
  OLD_IFS="$IFS"
  IFS=$'\n'
  for ex in ${PS_TOOLS_EXTRA_INPUT_TRIMMED}; do
    ex_trim="$(printf '%s' "${ex}" | sed 's/^\s*//; s/\s*$//')"
    if [[ -z "${ex_trim}" ]]; then
      continue
    fi
    if ! printf '%s' "${ex_trim}" | grep -Eq '^[a-z0-9-]+$'; then
      printf 'ERROR: invalid tool id in inputs.tools_extra: %s\n' "${ex_trim}" >&2
      exit 1
    fi
    if ! printf '%s' "${tools_list}" | grep -Fxq "${ex_trim}"; then
      if [[ -n "${tools_list}" ]]; then
        tools_list+=$'\n'
      fi
      tools_list+="${ex_trim}"
    fi
  done
  IFS="${OLD_IFS}"
fi

if [[ -z "${tools_list}" ]]; then
  printf 'ERROR: no tools selected (tools_bundle=none and tools_extra empty)\n' >&2
  exit 1
fi

printf 'PS.JOB_SETUP: tools=%s\n' "${tools_list}"
printf 'PS_TOOLS=%s\n' "${tools_list}" >> "${GITHUB_ENV}"
