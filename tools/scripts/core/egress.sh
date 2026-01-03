#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Egress Allowlist Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Enforce explicit allowlists for outbound network destinations.
# ==============================================================================

EGRESS_ALLOWLIST=()

_egress_trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
  return 0
}

load_egress_allowlist() {
  local root="${REPO_ROOT:-${repo_root:-}}"
  if [[ -z "${root}" ]]; then
    root="$(pwd)"
  fi
  local file="${PS_EGRESS_ALLOWLIST_FILE:-${root}/configs/ci/policies/egress-allowlist.yml}"
  if [[ ! -f "${file}" ]]; then
    printf 'ERROR: egress allowlist not found at %s\n' "${file}" >&2
    return 1
  fi

  EGRESS_ALLOWLIST=()
  local in_list=0
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(_egress_trim "${line}")"
    [[ -z "${line}" ]] && continue
    if [[ "${line}" == "allowlist:" ]]; then
      in_list=1
      continue
    fi
    if [[ "${line}" =~ ^[A-Za-z0-9_-]+: ]]; then
      if [[ "${in_list}" -eq 1 ]]; then
        break
      fi
      continue
    fi
    if [[ "${in_list}" -eq 1 && "${line}" == -* ]]; then
      local host="${line#-}"
      host="$(_egress_trim "${host}")"
      [[ -n "${host}" ]] && EGRESS_ALLOWLIST+=("${host}")
    fi
  done < "${file}"

  if [[ "${#EGRESS_ALLOWLIST[@]}" -eq 0 ]]; then
    printf 'ERROR: egress allowlist is empty (%s)\n' "${file}" >&2
    return 1
  fi
  return 0
}

_egress_host_from_url() {
  local url="$1"
  local rest="" host=""
  if [[ "${url}" == *"://"* ]]; then
    rest="${url#*://}"
    host="${rest%%/*}"
    host="${host%%:*}"
    printf '%s' "${host}"
    return 0
  fi
  if [[ "${url}" == *@*:* ]]; then
    rest="${url#*@}"
    host="${rest%%:*}"
    printf '%s' "${host}"
    return 0
  fi
  host="${url%%/*}"
  host="${host%%:*}"
  printf '%s' "${host}"
  return 0
}

assert_egress_allowed_host() {
  local host="$1"
  if [[ -z "${host}" ]]; then
    printf 'ERROR: egress host is empty\n' >&2
    return 1
  fi
  local allowed
  for allowed in "${EGRESS_ALLOWLIST[@]}"; do
    if [[ "${host}" == "${allowed}" ]]; then
      return 0
    fi
  done
  printf 'ERROR: egress host not allowlisted: %s\n' "${host}" >&2
  return 1
}

assert_egress_allowed_url() {
  local url="$1"
  if [[ -z "${url}" ]]; then
    printf 'ERROR: egress URL is empty\n' >&2
    return 1
  fi
  local host
  host="$(_egress_host_from_url "${url}")"
  assert_egress_allowed_host "${host}"
}

assert_egress_allowed_git_remote() {
  local remote="${1:-origin}"
  if ! command -v git >/dev/null 2>&1; then
    printf 'ERROR: git is required for egress checks\n' >&2
    return 1
  fi
  local url
  url="$(git remote get-url "${remote}" 2>/dev/null || true)"
  if [[ -z "${url}" ]]; then
    printf 'ERROR: git remote %s is not configured\n' "${remote}" >&2
    return 1
  fi
  assert_egress_allowed_url "${url}"
}
