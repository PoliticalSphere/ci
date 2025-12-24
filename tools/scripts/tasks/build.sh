#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Script: Build
# ==============================================================================
#
# METADATA
# ------------------------------------------------------------------------------
# id: build-script
# version: 1.0.0
# owner: political-sphere
# classification: internal
# created: 2025-12-24
# last_updated: 2025-12-24
#
# PURPOSE
# ------------------------------------------------------------------------------
# Run deterministic build steps for a Political Sphere repository.
#
# SCOPE & RESPONSIBILITIES
# ------------------------------------------------------------------------------
# DOES:
#   - Enforce deterministic builds in CI (lockfile required)
#   - Invoke repository-defined `npm run build` in a hardened, non-interactive way
#
# DOES NOT:
#   - Install dependencies (handled by ps-job-setup)
#   - Run tests or quality gates
#
# DESIGN PRINCIPLES
# ------------------------------------------------------------------------------
# - Deterministic, non-interactive execution
# - Provide helpful guidance when run locally (bootstrap mode)
# - Minimal and consistent output suitable for wrapping by `ps-run`
#
# ==============================================================================

die() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; return 0; }

# ----------------------------
# Resolve repo root
# ----------------------------
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  repo_root="$(pwd)"
  warn "git repo root not detected; using current directory: ${repo_root}"
fi

format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
  die() { ps_error "$*"; exit 1; }
  warn() { ps_warn "$*"; return 0; }
fi

detail() {
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    echo "$*"
  fi
  return 0
}

cd "${repo_root}"

# ----------------------------
# Non-interactive defaults
# ----------------------------
export CI="${CI:-0}"
# Favor color in CI if not explicitly set (GitHub Actions supports color).
# If FORCE_COLOR is explicitly provided, respect it; otherwise enable in CI and leave unset locally.
if [[ -z "${FORCE_COLOR:-}" && "${CI}" == "1" ]]; then
  export FORCE_COLOR=1
fi
export NPM_CONFIG_AUDIT="${NPM_CONFIG_AUDIT:-false}"
export NPM_CONFIG_FUND="${NPM_CONFIG_FUND:-false}"

# Optional: debug context (kept behind a flag)
if [[ "${PS_DEBUG:-0}" == "1" ]]; then
  detail "Build debug:"
  detail "repo_root=${repo_root}"
  detail "CI=${CI}"
  command -v node >/dev/null 2>&1 && detail "node=$(node --version)" || true
  command -v npm  >/dev/null 2>&1 && detail "npm=$(npm --version)"  || true
fi

# ----------------------------
# Prerequisites
# ----------------------------
[[ -f "${repo_root}/package.json" ]] || die "package.json not found in ${repo_root}; ensure you're running from the repository root or set the correct working directory."

command -v node >/dev/null 2>&1 || die "Node.js is required but not found on PATH; install Node.js (https://nodejs.org/) or ensure 'node' is available."

# Detect preferred package manager from lockfiles; prefer pnpm, then yarn, then npm.
if [[ -f "${repo_root}/pnpm-lock.yaml" ]]; then
  pm_cmd="pnpm"
elif [[ -f "${repo_root}/yarn.lock" ]]; then
  pm_cmd="yarn"
else
  pm_cmd="npm"
fi

# Ensure the selected package manager is available on PATH.
if ! command -v "${pm_cmd}" >/dev/null 2>&1; then
  die "Required package manager '${pm_cmd}' (indicated by lockfile presence) was not found on PATH. Install '${pm_cmd}' or ensure it is available in the runner."
fi

# Determinism precondition (install handled upstream, but lockfile must exist in CI)
if [[ "${CI}" == "1" && ! -f package-lock.json && ! -f npm-shrinkwrap.json && ! -f pnpm-lock.yaml && ! -f yarn.lock ]]; then
  die "No lockfile found (package-lock.json / npm-shrinkwrap.json / pnpm-lock.yaml / yarn.lock). Deterministic CI builds require a lockfile; run your package manager install locally and commit the generated lockfile."
fi

# ----------------------------
# Ensure scripts.build exists
# ----------------------------
has_build_script="0"
if node --input-type=module -e "
  import fs from 'node:fs';
  const p = JSON.parse(fs.readFileSync('./package.json','utf8'));
  process.exit(p?.scripts?.build ? 0 : 1);
" >/dev/null 2>&1; then
  has_build_script="1"
fi

if [[ "${has_build_script}" != "1" ]]; then
  if [[ "${CI}" == "1" ]]; then
    die "No 'build' script defined in package.json (build is mandatory in CI). Add a 'build' script in package.json that performs a deterministic build (e.g., 'build': 'your-build-command')."
  fi
  detail "Build: no 'build' script configured (bootstrap mode)."
  detail "HINT: add a deterministic build and a 'build' script in package.json."
  exit 0
fi

# ----------------------------
# Run build
# ----------------------------
# Pass-through args safely (supports: build.sh -- --flag, or build.sh --flag)
BUILD_ARGS=("$@")

# pm_cmd determined during prerequisites (already validated for availability)

# Prefer observable logs in CI; allow PS_QUIET=1 to reduce noise.
if [[ "${PS_QUIET:-0}" == "1" ]]; then
  "${pm_cmd}" run build --silent -- "${BUILD_ARGS[@]}"
else
  "${pm_cmd}" run build -- "${BUILD_ARGS[@]}"
fi
