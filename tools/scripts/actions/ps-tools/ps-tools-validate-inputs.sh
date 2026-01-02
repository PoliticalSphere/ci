#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Tools Validate Inputs
# ------------------------------------------------------------------------------
# Purpose:
#   Validate ps-tools inputs.
# ------------------------------------------------------------------------------
# Dependencies:
#   - tools/scripts/actions/cross-cutting/validate.sh
#   - tools/scripts/actions/cross-cutting/string.sh
#   - tools/scripts/actions/cross-cutting/path.sh
#   - PS_SCRIPTS_ROOT, PS_INSTALL_DIR_INPUT, PS_BUNDLE_INPUT, PS_EXTRA_INPUT, PS_TOOLS_INPUT
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-tools/action.yml
# ==============================================================================

scripts_root="${PS_SCRIPTS_ROOT:-${GITHUB_WORKSPACE}}"
# shellcheck source=tools/scripts/actions/cross-cutting/validate.sh
. "${scripts_root}/tools/scripts/actions/cross-cutting/validate.sh"
# shellcheck source=tools/scripts/actions/cross-cutting/string.sh
. "${scripts_root}/tools/scripts/actions/cross-cutting/string.sh"
# shellcheck source=tools/scripts/actions/cross-cutting/path.sh
. "${scripts_root}/tools/scripts/actions/cross-cutting/path.sh"

# install_dir validation (source of truth)
install_dir="${PS_INSTALL_DIR_INPUT:-.tooling/bin}"
require_nonempty "inputs.install_dir" "${install_dir}" || exit 1
if ! safe_relpath_no_dotdot "${install_dir}"; then
  v_error "inputs.install_dir must be repo-relative and must not contain '..' or be absolute"
  exit 1
fi

# If explicit `tools` is provided, we accept it as authoritative
tools_raw="${PS_TOOLS_INPUT:-}"
if [[ -n "${tools_raw}" ]]; then
  require_nonempty "inputs.tools" "${tools_raw}" || exit 1
  # Validate explicit tools input: enforce same pattern as extra_tools
  tools_trimmed="$(trim "${tools_raw}")"
  tools_count=0
  while IFS= read -r t; do
    t_trim="$(trim "${t}")"
    if [[ -z "${t_trim}" ]]; then
      continue
    fi
    if ! printf '%s' "${t_trim}" | grep -Eq '^[a-z0-9-]+$'; then
      v_error "invalid tool id in inputs.tools: ${t_trim} (allowed: lowercase letters, digits, hyphen)"
      exit 1
    fi
    tools_count=$((tools_count + 1))
  done <<< "${tools_trimmed}"

  printf 'PS.TOOLS: using explicit tools input (count=%s)\n' "${tools_count}"
  printf 'PS.TOOLS_INPUT=%q\n' "${tools_raw}" >> "${GITHUB_ENV}"
  exit 0
fi

# Otherwise validate bundle enum and extra tools format
require_enum "inputs.bundle" "${PS_BUNDLE_INPUT}" "lint" "security" "none" || exit 1

# Extra tools can be empty; when provided ensure each id is lowercase letters, digits or hyphen
extra_trimmed="$(trim "${PS_EXTRA_INPUT}")"
extra_count=0

# Early exit: if bundle=none and no extras provided, fail fast (saves runner time)
if [[ "${PS_BUNDLE_INPUT}" == "none" && -z "${extra_trimmed}" ]]; then
  v_error "no tools selected (bundle=none and extra_tools empty). If you intended to provide explicit tools, use the 'tools' input."
  exit 1
fi

if [[ -n "${extra_trimmed}" ]]; then
  while IFS= read -r ex; do
    ex_trim="$(trim "${ex}")"
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
