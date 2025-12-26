#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Tools Validate Inputs
# ------------------------------------------------------------------------------
# Purpose:
#   Validate ps-tools inputs.
# ------------------------------------------------------------------------------
# Dependencies:
#   - tools/scripts/branding/validate-inputs.sh
#   - PS_SCRIPTS_ROOT, PS_INSTALL_DIR_INPUT, PS_BUNDLE_INPUT, PS_EXTRA_INPUT, PS_TOOLS_INPUT
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-tools/action.yml
# ==============================================================================


scripts_root="${PS_SCRIPTS_ROOT:?PS_SCRIPTS_ROOT not set}"

validate_sh="${scripts_root}/tools/scripts/branding/validate-inputs.sh"
if [[ ! -f "${validate_sh}" ]]; then
  printf 'ERROR: validate-inputs.sh not found at %s\n' "${validate_sh}" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "${validate_sh}"

# install_dir validation (source of truth)
install_dir="${PS_INSTALL_DIR_INPUT:-.tooling/bin}"
require_nonempty "inputs.install_dir" "${install_dir}" || exit 1
if [[ "${install_dir}" == /* || "${install_dir}" == *".."* ]]; then
  v_error "inputs.install_dir must be repo-relative and must not contain '..' or be absolute"
  exit 1
fi

# If explicit `tools` is provided, we accept it as authoritative
tools_raw="${PS_TOOLS_INPUT:-}"
if [[ -n "${tools_raw}" ]]; then
  require_nonempty "inputs.tools" "${tools_raw}" || exit 1
  # Validate explicit tools input: enforce same pattern as extra_tools
  tools_trimmed="$(printf '%s' "${tools_raw}" | sed 's/^\s*//; s/\s*$//')"
  tools_count=0
  while IFS= read -r t; do
    t_trim="$(printf '%s' "${t}" | sed 's/^\s*//; s/\s*$//')"
    if [[ -z "${t_trim}" ]]; then
      continue
    fi
    if ! printf '%s' "${t_trim}" | grep -Eq '^[a-z0-9-]+$'; then
      v_error "invalid tool id in inputs.tools: ${t_trim} (allowed: lowercase letters, digits, hyphen)"
      exit 1
    fi
  done <<< "${tools_trimmed}"

    tools_count=$((tools_count + 1))
  done <<< "${tools_trimmed}"

  printf 'PS.TOOLS: using explicit tools input (count=%s)\n' "${tools_count}"
  printf 'PS.TOOLS_INPUT=%q\n' "${tools_raw}" >> "${GITHUB_ENV}"
  exit 0
fi

# Otherwise validate bundle enum and extra tools format
require_enum "inputs.bundle" "${PS_BUNDLE_INPUT}" "lint" "security" "none" || exit 1

# Extra tools can be empty; when provided ensure each id is lowercase letters, digits or hyphen
extra_trimmed="$(printf '%s' "${PS_EXTRA_INPUT}" | sed 's/^\s*//; s/\s*$//')"
extra_count=0

# Early exit: if bundle=none and no extras provided, fail fast (saves runner time)
if [[ "${PS_BUNDLE_INPUT}" == "none" && -z "${extra_trimmed}" ]]; then
  v_error "no tools selected (bundle=none and extra_tools empty). If you intended to provide explicit tools, use the 'tools' input."
  exit 1
fi

if [[ -n "${extra_trimmed}" ]]; then
  while IFS= read -r ex; do
    ex_trim="$(printf '%s' "${ex}" | sed 's/^\s*//; s/\s*$//')"
    if [[ -z "${ex_trim}" ]]; then
      continue
    fi
    if ! printf '%s' "${ex_trim}" | grep -Eq '^[a-z0-9-]+$'; then
      v_error "invalid tool id in inputs.extra_tools: ${ex_trim} (allowed: lowercase letters, digits, hyphen)"
      exit 1
    fi
    extra_count=$((extra_count + 1))
  done <<< "${extra_trimmed}"
fi

printf 'PS.TOOLS: bundle=%s extra_tools_count=%s\n' "${PS_BUNDLE_INPUT}" "${extra_count}"
