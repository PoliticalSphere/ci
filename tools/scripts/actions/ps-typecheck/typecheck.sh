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

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Optional formatting (best effort; do not hard-fail if absent)
format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

PS_LOG_COMPONENT="lint.typecheck"
typecheck_status_override=""
typecheck_start_ms=""
if command -v ps_epoch_ms >/dev/null 2>&1; then
  typecheck_start_ms="$(ps_epoch_ms)"
fi
if command -v ps_log >/dev/null 2>&1; then
  ps_log info lint.tool.start "id=lint.typecheck" "title=TYPECHECK" "detail=Type checking (tsc)"
fi
typecheck_log_finish() {
  local rc="${1:-0}"
  local status=""
  local end_ms=""
  local duration_ms=""

  if [[ -n "${typecheck_status_override}" ]]; then
    status="${typecheck_status_override}"
  elif [[ "${rc}" -eq 0 ]]; then
    status="PASS"
  else
    status="FAIL"
  fi

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  fi
  if [[ -n "${typecheck_start_ms}" && -n "${end_ms}" ]]; then
    duration_ms=$((end_ms - typecheck_start_ms))
  fi

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info lint.tool.finish \
      "id=lint.typecheck" \
      "title=TYPECHECK" \
      "status=${status}" \
      "exit_code=${rc}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi
  return 0
}
trap 'typecheck_log_finish $?' EXIT

project_tsconfig="${repo_root}/tsconfig.json"
if [[ ! -f "${project_tsconfig}" ]]; then
  typecheck_status_override="ERROR"
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
    typecheck_status_override="ERROR"
    ps_error "tsc not found. Fix: npm ci"
  else
    typecheck_status_override="ERROR"
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
    typecheck_status_override="ERROR"
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
