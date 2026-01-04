#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Gate Runner Facade
# ------------------------------------------------------------------------------
# Purpose:
#   Shared helpers for gate entrypoints (pre-commit / pre-push).
#   This file acts as a facade, sourcing modular components from core/.
#
# Provides:
#   - Repo root discovery and path exports
#   - Environment defaults (CI, color, timestamps)
#   - Structured gate logging (gate_log_start, gate_log_finish)
#   - Error trapping with step context
#   - Lint summary UI with inline updating
#   - Lint step runners (sync and async)
#   - Generic step runner and autofix helpers
#
# Key UX rules:
#   - NEVER print an "all Waiting" summary block
#   - In non-TTY/CI, never spam repeated summary blocks
#   - In TTY, inline updates are enabled by default
#   - Summary avoids long absolute paths to prevent wrapping
#
# Caller expectations:
#   - Caller sets: GATE_NAME (e.g., "Pre-commit", "Pre-push")
#
# Env toggles:
#   CI=1                          Prefer CI-friendly behaviour
#   FORCE_COLOR=1                 Force ANSI color output
#   NO_COLOR=1                    Disable ANSI color output
#   PS_LINT_INLINE=1              Enable in-place lint summary updates (TTY only)
#   PS_LINT_PRINT_MODE=auto       auto|inline|first|final|never
#
# Architecture:
#   This facade sources the following modular components:
#   - core/path-resolution.sh     Path and repo root discovery
#   - core/gate-logging.sh        Gate lifecycle logging
#   - core/lint-summary.sh        Lint summary UI
#   - core/lint-runner.sh         Lint step execution
#   - core/step-runner.sh         Generic step execution
#   - core/trap-handlers.sh       Error trapping
#   - branding/format.sh          Output formatting
# ==============================================================================

# ----------------------------
# Repo root + paths (via canonical path-resolution.sh)
# ----------------------------
_gate_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# shellcheck source=tools/scripts/core/environment/path-resolution.sh
. "${_gate_script_dir}/../core/environment/path-resolution.sh"

repo_root="${PS_REPO_ROOT}"

tools_scripts="${repo_root}/tools/scripts"
branding_scripts="${tools_scripts}/branding"
core_scripts="${tools_scripts}/core"

if [[ ! -d "${tools_scripts}" ]]; then
  printf 'ERROR: tools/scripts not found at: %s\n' "${tools_scripts}" >&2
  printf '       repo_root resolved to: %s\n' "${repo_root}" >&2
  exit 2
fi
if [[ ! -d "${branding_scripts}" ]]; then
  printf 'ERROR: branding scripts not found at: %s\n' "${branding_scripts}" >&2
  printf '       expected: %s/tools/scripts/branding\n' "${repo_root}" >&2
  exit 2
fi

export PS_TOOLS_SCRIPTS="${tools_scripts}"
export PS_BRANDING_SCRIPTS="${branding_scripts}"
export PS_LINT_SCRIPTS="${tools_scripts}/lint"
export PS_SECURITY_SCRIPTS="${tools_scripts}/security"
export PS_TASKS_SCRIPTS="${tools_scripts}/tasks"
export PS_NAMING_SCRIPTS="${tools_scripts}/naming"

# ----------------------------
# Non-interactive defaults
# ----------------------------
export CI="${CI:-0}"
export FORCE_COLOR="${FORCE_COLOR:-0}"
export NO_COLOR="${NO_COLOR:-0}"

# Timestamp format for logs and messages (RFC-like, UTC)
PS_TIMESTAMP_FMT="${PS_TIMESTAMP_FMT:-%Y-%m-%dT%H:%M:%SZ}"

PS_LINT_INLINE="${PS_LINT_INLINE:-1}"
PS_LINT_PRINT_MODE="${PS_LINT_PRINT_MODE:-auto}"
PS_LINT_SECTION_HEADERS="${PS_LINT_SECTION_HEADERS:-1}"
PS_LINT_STEP_LINES="${PS_LINT_STEP_LINES:-1}"

# ----------------------------
# Gate state (error summaries)
# ----------------------------
CURRENT_STEP_ID=""
CURRENT_STEP_TITLE=""

# ----------------------------
# Lint summary state (shared with lint-summary.sh and lint-runner.sh)
# ----------------------------
LINT_DIR="${repo_root}/logs/lint"
LINT_IDS=()
LINT_LABELS=()
LINT_STATUSES=()
LINT_LOGS=()
LINT_PIDS=()
LINT_START_MS=()

LINT_SUMMARY_LINES=0
LINT_SUMMARY_EVER_PRINTED=0
LINT_SUMMARY_EVER_STARTED=0

# ----------------------------
# Load formatting helpers (single UI spec)
# ----------------------------
format_sh="${branding_scripts}/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi

# Fallbacks if format.sh missing (shouldn't happen, but keep gates resilient)
PS_FMT_ICON="${PS_FMT_ICON:-▶}"
PS_FMT_RULE="${PS_FMT_RULE:-────────────────────────────────────────}"

# ----------------------------
# Source modular components
# ----------------------------

# Gate lifecycle logging
# shellcheck source=tools/scripts/core/logging/gate-logging.sh
. "${core_scripts}/logging/gate-logging.sh"

# Lint summary UI (must come before lint-runner.sh)
# shellcheck source=tools/scripts/core/lint-summary.sh
. "${core_scripts}/lint-summary.sh"

# Lint step execution
# shellcheck source=tools/scripts/core/lint-runner.sh
. "${core_scripts}/lint-runner.sh"

# Generic step execution
# shellcheck source=tools/scripts/core/step-runner.sh
. "${core_scripts}/step-runner.sh"

# Error trapping (sets traps - should be last)
# shellcheck source=tools/scripts/core/logging/trap-handlers.sh
. "${core_scripts}/logging/trap-handlers.sh"
