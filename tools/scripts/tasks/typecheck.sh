#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — TypeScript Typecheck
# ------------------------------------------------------------------------------
# Purpose:
#   Run strict TypeScript checks using the repo tsconfig.json.
#
# Principles:
#   - No banner/section printing here (gate owns UX)
#   - Deterministic tool resolution (prefer repo-local tsc)
#   - Stable output for CI/log parsing
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Optional formatting (best effort; do not hard-fail if absent)
format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

project_tsconfig="${repo_root}/tsconfig.json"
if [[ ! -f "${project_tsconfig}" ]]; then
  if command -v ps_error >/dev/null 2>&1; then
    ps_error "project tsconfig not found: ${project_tsconfig}"
    ps_detail_err "HINT: create tsconfig.json that extends configs/lint/tsconfig.base.json and defines include/files."
  else
    printf 'ERROR: project tsconfig not found: %s\n' "${project_tsconfig}" >&2
    printf '  HINT: create tsconfig.json that extends configs/lint/tsconfig.base.json and defines include/files.\n' >&2
  fi
  exit 1
fi

TSC_BIN=""
if [[ -x "${repo_root}/node_modules/.bin/tsc" ]]; then
  TSC_BIN="${repo_root}/node_modules/.bin/tsc"
elif command -v tsc >/dev/null 2>&1; then
  TSC_BIN="$(command -v tsc)"
else
  if command -v ps_error >/dev/null 2>&1; then
    ps_error "tsc not found. Fix: npm ci"
  else
    echo "ERROR: tsc not found. Fix: npm ci" >&2
  fi
  exit 1
fi

# Pass-through args safely.
# Ensure the array is always declared to avoid "unbound variable" when set -u is active.
declare -a TSC_ARGS=()
TSC_ARGS=("$@")

# Run: fail on any diagnostic; stable output (no pretty formatting).
# Some tsc versions don't accept '--pretty false' so use NO_COLOR to avoid
# colored/pretty output in CI while keeping invocation portable across tsc
# versions.
# Guard against accidental source files being passed (tSC error TS5042) and
# fail early with a clear message.
for arg in "${TSC_ARGS[@]:-}"; do
  if [[ "${arg}" == *.ts || "${arg}" == *.tsx ]]; then
    echo "ERROR: typecheck.sh must not receive source files when using --project" >&2
    exit 1
  fi
done
# Conditionally include additional args only when provided to avoid tsc
# interpreting an empty expansion as source inputs.
if [[ "${#TSC_ARGS[@]:-0}" -gt 0 ]]; then
  NO_COLOR=1 "${TSC_BIN}" --project "${project_tsconfig}" "${TSC_ARGS[@]}"
else
  NO_COLOR=1 "${TSC_BIN}" --project "${project_tsconfig}"
fi

# Optional success hint (quiet by default in CI)
if [[ "${CI:-0}" == "0" ]]; then
  if command -v ps_detail >/dev/null 2>&1; then
    ps_detail "Typecheck: OK"
  else
    echo "Typecheck: OK"
  fi
fi
