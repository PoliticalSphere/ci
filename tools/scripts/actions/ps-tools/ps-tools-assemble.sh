#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Tools Assemble
# ------------------------------------------------------------------------------
# Purpose:
#   Assemble the tool list from bundle/extra/explicit inputs.
# ------------------------------------------------------------------------------
# Dependencies:
#   - PS_BUNDLE_INPUT, PS_EXTRA_INPUT, PS_TOOLS_INPUT
#   - GITHUB_OUTPUT (optional)
# Dependents:
#   - ./.github/actions/ps-bootstrap/ps-tools/action.yml
# ==============================================================================


error() {
  if type -t v_error >/dev/null 2>&1; then
    v_error "$*"
  else
    printf 'ERROR: %s\n' "$*" >&2
  fi
}

emit_tools_output() {
  local tools_value="$1"
  local output_name="${PS_TOOLS_OUTPUT_NAME:-tools}"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "${output_name}<<'EOF'"
      printf '%s\n' "${tools_value}"
      echo "EOF"
    } >> "${GITHUB_OUTPUT}"
  else
    printf '%s\n' "${tools_value}"
  fi
}

trim_ws() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s}"
}

bundle_tools() {
  case "${1:-}" in
    lint) printf '%s' $'actionlint\nshellcheck\nhadolint\nyamllint' ;;
    security) printf '%s' $'gitleaks' ;;
    *) printf '%s' "" ;;
  esac
}

# If explicit `tools` provided, normalize and pass it through
if [[ -n "${PS_TOOLS_INPUT:-}" ]]; then
  clean_tools="$(printf '%s' "${PS_TOOLS_INPUT}" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$')"
  printf 'PS.TOOLS: using explicit tools input\n'
  emit_tools_output "${clean_tools}"
  exit 0
fi

tools_list="$(bundle_tools "${PS_BUNDLE_INPUT}")"

# 3. Append Extras with deduplication
PS_EXTRA_INPUT_TRIMMED="${PS_EXTRA_INPUT:-}"
if [[ -n "${PS_EXTRA_INPUT_TRIMMED// }" ]]; then
  while IFS= read -r tool || [[ -n "${tool:-}" ]]; do
    tool_trim="$(trim_ws "${tool}")"
    [[ -z "${tool_trim}" ]] && continue

    # Deduplicate using newline-delimited string match.
    if [[ $'\n'"${tools_list}"$'\n' != *$'\n'"${tool_trim}"$'\n'* ]]; then
      tools_list="${tools_list:+$tools_list$'\n'}${tool_trim}"
    fi
  done <<< "${PS_EXTRA_INPUT_TRIMMED}"
fi

if [[ -z "${tools_list}" ]]; then
  error "no tools selected (bundle=none and extra_tools empty)"
  exit 1
fi

printf 'PS.TOOLS: final tools list:\n%s\n' "${tools_list}"
emit_tools_output "${tools_list}"
