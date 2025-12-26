#!/usr/bin/env bash
set -euo pipefail

scripts_root="${PS_SCRIPTS_ROOT:-${GITHUB_WORKSPACE:-$(pwd)}}"

if [[ -z "${PS_TOOLS:-}" ]]; then
  printf 'ERROR: PS_TOOLS is empty; nothing to install.\n' >&2
  exit 1
fi

# Normalize tool list into an array (newline-separated)
mapfile -t tools_arr < <(printf '%s\n' "${PS_TOOLS}" | sed 's/^\s*//; s/\s*$//' | grep -v '^$')

if [[ ${#tools_arr[@]} -eq 0 ]]; then
  printf 'ERROR: PS_TOOLS did not contain any valid tool ids.\n' >&2
  exit 1
fi

if [[ -n "${PS_INSTALL_DIR:-}" ]]; then
  export PS_INSTALL_DIR
fi

cd "${scripts_root}" || { printf 'ERROR: failed to cd into %s\n' "${scripts_root}" >&2; exit 1; }
bash "${scripts_root}/tools/scripts/ci/install-tools.sh" "${tools_arr[@]}"
