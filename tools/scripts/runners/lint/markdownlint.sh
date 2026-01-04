#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Markdownlint Lint Runner
# ==============================================================================
# ps_header_v: 6
#
# INTENT: Validate Markdown files using repo configuration.
# MODES: staged (fast) / PR (affected) / full (PS_FULL_SCAN=1)
# ==============================================================================

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/scripts/core/runner-base.sh
. "${_script_dir}/../../core/runner-base.sh"

# Configuration
runner_init "lint.markdown" "MARKDOWN" "Markdown quality checks"

# Find markdown config (prefer .markdownlint.json, then fallbacks)
MARKDOWN_CONFIG=""
for cfg in .markdownlint.json markdownlint-cli2.jsonc markdownlint.jsonc markdownlint.json markdownlint.yml; do
  if [[ -f "configs/lint/${cfg}" ]]; then
    MARKDOWN_CONFIG="configs/lint/${cfg}"
    break
  fi
done

if [[ -z "${MARKDOWN_CONFIG}" ]]; then
  v_error "markdownlint config not found"
  exit 1
fi

runner_require_config "${MARKDOWN_CONFIG}" "Markdownlint config"
runner_require_tool "markdownlint-cli2" "node_modules/.bin/markdownlint-cli2" "0"

MDL_ARGS=()
if [[ "$#" -gt 0 ]]; then
  MDL_ARGS=("$@")
fi

timeout_s="${PS_MARKDOWNLINT_TIMEOUT:-}"
if [[ -z "${timeout_s}" && "${CI:-0}" == "1" ]]; then
  timeout_s="300"
fi

timeout_cmd=""
if [[ -n "${timeout_s}" ]]; then
  if command -v timeout >/dev/null 2>&1; then
    timeout_cmd="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_cmd="gtimeout"
  fi
fi

# Collect markdown targets
runner_collect_targets "*.md"

# Skip if no targets
if runner_skip_if_no_targets "No Markdown files to check"; then
  exit 0
fi

# Execute markdownlint-cli2
runner_exec "${RUNNER_TOOL_BIN}" \
  --config "${RUNNER_CONFIG}" \
  "${RUNNER_TARGETS[@]}"

exit "${RUNNER_STATUS}"

