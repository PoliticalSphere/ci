#!/usr/bin/env bash
set -euo pipefail

repo_root="${GITHUB_WORKSPACE:-$(pwd)}"
format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

error() {
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    printf 'ERROR: %q\n' "$*" >&2
  fi
}

detail() {
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    printf '%s\n' "$*"
  fi
}

check_lines() {
  local label="$1"
  local list="$2"
  local kind="$3"

  while IFS= read -r line; do
    local item
    item="$(printf '%s' "${line}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ -z "${item}" ]]; then
      continue
    fi

    case "${kind}" in
      file)
        if [[ ! -f "${repo_root}/${item}" ]]; then
          error "${label} missing: ${item}"
          exit 1
        fi
        ;;
      dir)
        if [[ ! -d "${repo_root}/${item}" ]]; then
          error "${label} missing: ${item}"
          exit 1
        fi
        ;;
      cmd)
        if ! command -v "${item}" >/dev/null 2>&1; then
          error "${label} missing: ${item}"
          exit 1
        fi
        ;;
      env)
        if [[ -z "${!item:-}" ]]; then
          error "${label} missing: ${item}"
          exit 1
        fi
        ;;
      *)
        ;;
    esac
  done <<< "${list}"
}

check_lines "Required file" "${PS_REQUIRE_FILES:-}" "file"
check_lines "Required directory" "${PS_REQUIRE_DIRS:-}" "dir"
check_lines "Required command" "${PS_REQUIRE_COMMANDS:-}" "cmd"
check_lines "Required env var" "${PS_REQUIRE_ENV:-}" "env"

detail "PS.PREFLIGHT: OK"
