#!/usr/bin/env bash
set -euo pipefail

error() {
  if type -t v_error >/dev/null 2>&1; then
    v_error "$*"
  else
    printf 'ERROR: %s\n' "$*" >&2
  fi
}

# If explicit `tools` provided, pass it through
if [[ -n "${PS_TOOLS_INPUT:-}" ]]; then
  printf 'PS.TOOLS: using explicit tools input: %s\n' "${PS_TOOLS_INPUT}"
  printf 'PS_TOOLS=%s\n' "${PS_TOOLS_INPUT}" >> "${GITHUB_ENV}"
  exit 0
fi

tools_list=""
if [[ "${PS_BUNDLE_INPUT}" == "lint" ]]; then
  tools_list=$'actionlint\nshellcheck\nhadolint\nyamllint'
elif [[ "${PS_BUNDLE_INPUT}" == "security" ]]; then
  tools_list=$'gitleaks'
fi

# 3. Append Extras with deduplication
PS_EXTRA_INPUT_TRIMMED="$(printf '%s' "${PS_EXTRA_INPUT}" | sed 's/^\s*//; s/\s*$//')"
if [[ -n "${PS_EXTRA_INPUT_TRIMMED// }" ]]; then
  while IFS= read -r tool || [[ -n "${tool:-}" ]]; do
    tool_trim="$(printf '%s' "${tool}" | xargs)"
    [[ -z "${tool_trim}" ]] && continue

    # Use grep -F (fixed strings) and -x (exact line) for safety when checking duplicates
    if ! printf '%s\n' "${tools_list}" | grep -Fxq "${tool_trim}"; then
      tools_list="${tools_list:+$tools_list$'\n'}${tool_trim}"
    fi
  done <<< "${PS_EXTRA_INPUT_TRIMMED}"
fi

if [[ -z "${tools_list}" ]]; then
  error "no tools selected (bundle=none and extra_tools empty)"
  exit 1
fi

printf 'PS.TOOLS: final tools list:\n%s\n' "${tools_list}"
printf 'PS_TOOLS=%s\n' "${tools_list}" >> "${GITHUB_ENV}"
