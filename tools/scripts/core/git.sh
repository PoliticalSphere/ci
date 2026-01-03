#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Git Helpers
# ------------------------------------------------------------------------------
# Purpose:
#   Shared git discovery helpers for scripts under tools/scripts.
# ==============================================================================

ps_git_realpath_dir() {
  local d="$1"
  if ( cd "$d" >/dev/null 2>&1 ); then
    ( cd "$d" >/dev/null 2>&1 && pwd -P )
  else
    printf '%s' "$d"
  fi
  return 0
}

ps_git_has_repo() {
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  return 0
}

ps_git_repo_root() {
  if ps_git_has_repo; then
    git rev-parse --show-toplevel 2>/dev/null || return 1
  else
    return 1
  fi
}

ps_git_resolve_repo_root() {
  local root=""
  if ps_git_has_repo; then
    root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  fi
  [[ -n "${root}" ]] || root="$(pwd)"
  ps_git_realpath_dir "${root}"
  return 0
}
