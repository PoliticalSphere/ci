#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Build Script
# ------------------------------------------------------------------------------
# Purpose:
#   Run deterministic build steps for a Political Sphere repository.
#
# Contract:
#   - Must be run from anywhere; script will resolve repo root and run from there.
#   - Does NOT install dependencies (handled upstream by ps-node-setup).
#
# Policy:
#   - In CI: a lockfile MUST exist and package.json MUST define scripts.build.
#   - Locally: missing scripts.build exits cleanly with guidance (bootstrap mode).
#
# Outputs:
#   - Intended to be wrapped by ps-run (logs/reports handled there).
# ==============================================================================

die() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

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
  warn() { ps_warn "$*"; }
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
export FORCE_COLOR="${FORCE_COLOR:-0}"
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
[[ -f "${repo_root}/package.json" ]] || die "package.json not found; cannot run build."
command -v node >/dev/null 2>&1 || die "node is required but was not found on PATH."
command -v npm  >/dev/null 2>&1 || die "npm is required but was not found on PATH."

# Determinism precondition (install handled upstream, but lockfile must exist in CI)
if [[ "${CI}" == "1" ]]; then
  if [[ ! -f package-lock.json && ! -f npm-shrinkwrap.json && ! -f pnpm-lock.yaml && ! -f yarn.lock ]]; then
    die "No lockfile found (package-lock.json / npm-shrinkwrap.json / pnpm-lock.yaml / yarn.lock). Deterministic CI builds require a lockfile."
  fi
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
    die "No 'build' script defined in package.json (build is mandatory in CI)."
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

# Prefer observable logs in CI; allow PS_QUIET=1 to reduce noise.
if [[ "${PS_QUIET:-0}" == "1" ]]; then
  npm run build --silent -- "${BUILD_ARGS[@]}"
else
  npm run build -- "${BUILD_ARGS[@]}"
fi
