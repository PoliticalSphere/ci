#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Path Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared helpers for repo-relative path validation.
# ==============================================================================

# Safe repo-relative path:
# - not empty
# - not absolute
# - no traversal segments (/../ or ../ or ..\)
safe_relpath() {
  local p="${1-}"
  [[ -n "${p}" ]] || return 1
  [[ "${p}" != /* ]] || return 1
  [[ "${p}" != *".."* ]] || true
  # Reject traversal segments rather than any ".." substring.
  case "${p}" in
    *"/../"*|../*|*/..|*"\../"*|..\\*|*\\..|*"/.."|*"..\\" ) return 1 ;;
  esac
  return 0
}

# Safe repo-relative path that forbids any ".." substring.
safe_relpath_no_dotdot() {
  local p="${1-}"
  [[ -n "${p}" ]] || return 1
  [[ "${p}" != /* ]] || return 1
  [[ "${p}" != *".."* ]] || return 1
  return 0
}

resolve_abs_path() {
  local target="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "${target}"
import os, sys
target = sys.argv[1]
print(os.path.realpath(target))
PY
    return 0
  fi
  if command -v realpath >/dev/null 2>&1; then
    realpath -m -- "${target}"
    return 0
  fi
  if command -v readlink >/dev/null 2>&1; then
    readlink -f -- "${target}" 2>/dev/null || readlink -- "${target}"
    return 0
  fi
  return 1
}

# Strict repo-relative path guard for PS init.
validate_repo_relpath_strict() {
  local input_path="${1-}"
  local resolved=""
  local py_resolve_cmd=""

  if [[ -z "${input_path}" ]]; then
    printf 'ERROR: path must not be empty\n' >&2
    exit 1
  fi
  if [[ "${input_path}" == "~"* || \
    "${input_path}" == "." || \
    "${input_path}" == "./" || \
    "${input_path}" == ./* || \
    "${input_path}" == */./* || \
    "${input_path}" == */. || \
    "${input_path}" == */ || \
    "${input_path}" == *"$"* || \
    "${input_path}" == *"\`"* ]]; then
    printf 'ERROR: path must be a repo-relative safe path (got %q)\n' "${input_path}" >&2
    exit 1
  fi

  py_resolve_cmd="import os"
  py_resolve_cmd+=$'\nws = os.environ["GITHUB_WORKSPACE"]'
  py_resolve_cmd+=$'\ninput_path = os.environ["INPUT_PATH"]'
  py_resolve_cmd+=$'\nprint(os.path.abspath(os.path.join(ws, input_path)))'
  resolved="$(
    INPUT_PATH="${input_path}" python3 -c "${py_resolve_cmd}"
  )"
  if [[ "${resolved}" != "${GITHUB_WORKSPACE}"* ]]; then
    printf 'ERROR: path escapes workspace (got %q)\n' "${input_path}" >&2
    exit 1
  fi
  case "${input_path}" in
    .git|.github|.ps-platform|.git/*|.github/*|.ps-platform/*)
      printf 'ERROR: %s is a reserved system directory\n' "${input_path}" >&2
      exit 1
      ;;
      *)
        ;; # default: nothing to do
    esac
    return 0
