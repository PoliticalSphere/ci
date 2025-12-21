#!/usr/bin/env bash
set -euo pipefail

# Common helpers for gate scripts (pre-commit, pre-push)
# Expects caller to set GATE_NAME to a friendly name like "Pre-commit" or "Pre-push"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  repo_root="$(pwd)"
fi

tools_scripts="${repo_root}/tools/scripts"
branding_scripts="${tools_scripts}/branding"

export PS_TOOLS_SCRIPTS="${tools_scripts}"
export PS_BRANDING_SCRIPTS="${branding_scripts}"
export PS_LINT_SCRIPTS="${tools_scripts}/lint"
export PS_SECURITY_SCRIPTS="${tools_scripts}/security"
export PS_TASKS_SCRIPTS="${tools_scripts}/tasks"
export PS_NAMING_SCRIPTS="${tools_scripts}/naming"

export CI=1
export FORCE_COLOR="${FORCE_COLOR:-0}"
export NO_COLOR="${NO_COLOR:-0}"

# Track current step for failure summaries.
CURRENT_STEP_ID=""
CURRENT_STEP_TITLE=""

on_error() {
  local exit_code="$?"
  echo
  if [[ -n "${CURRENT_STEP_ID}" ]]; then
    bash "${branding_scripts}/print-section.sh" \
      "gate.failed" \
      "${GATE_NAME} gate failed" \
      "Failed at: ${CURRENT_STEP_ID} — ${CURRENT_STEP_TITLE} (exit ${exit_code})"
  else
    echo "ERROR: ${GATE_NAME} gate failed (exit ${exit_code})" >&2
  fi
  exit "${exit_code}"
}

run_step() {
  local id="$1"
  local title="$2"
  local description="$3"
  shift 3

  CURRENT_STEP_ID="${id}"
  CURRENT_STEP_TITLE="${title}"

  bash "${branding_scripts}/print-section.sh" "${id}" "${title}" "${description}"

  # Execute the command exactly as provided.
  "$@"
}

print_success() {
  CURRENT_STEP_ID=""
  CURRENT_STEP_TITLE=""
  bash "${branding_scripts}/print-section.sh" \
    "gate.ok" \
    "${GATE_NAME} gate passed" \
    "All checks completed successfully"
}
