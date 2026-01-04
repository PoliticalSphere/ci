#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Runner Base (High-Level Abstraction)
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/core/runner-base.sh
#   file_type: script
#   language: bash
#   version: 1.0.0
#   status: active
#   classification: internal
#   owner: political-sphere
#   last_editor: codex
#
# INTENT
# -----------------------------------------------------------------------------
# Provides a high-level abstraction layer for all tool runners (lint, security,
# build, etc.). This is the single source of truth for:
#   - Runner initialization and context setup
#   - Target collection (staged, PR diff, find-based, full scan)
#   - Tool binary discovery and validation
#   - Execution lifecycle (start, run, finish)
#   - Structured logging and status reporting
#   - Exit code handling and status evaluation
#
# ARCHITECTURE
# -----------------------------------------------------------------------------
#   ┌──────────────────────────────────────────────────────────────────────────┐
#   │                           runner-base.sh                                  │
#   │  ┌─────────────────────────────────────────────────────────────────────┐ │
#   │  │  Context Layer: repo_root, mode, targets, config                    │ │
#   │  ├─────────────────────────────────────────────────────────────────────┤ │
#   │  │  Target Layer: staged, PR diff, find-based, full scan               │ │
#   │  ├─────────────────────────────────────────────────────────────────────┤ │
#   │  │  Tool Layer: binary discovery, config validation                    │ │
#   │  ├─────────────────────────────────────────────────────────────────────┤ │
#   │  │  Execution Layer: run with logging, status, timing                  │ │
#   │  └─────────────────────────────────────────────────────────────────────┘ │
#   └──────────────────────────────────────────────────────────────────────────┘
#
# USAGE
# -----------------------------------------------------------------------------
# In your runner script:
#
#   #!/usr/bin/env bash
#   set -euo pipefail
#   script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "${script_dir}/../../core/runner-base.sh"
#
#   # Initialize runner
#   runner_init "lint.biome" "BIOME" "Formatting and correctness checks"
#
#   # Require config file
#   runner_require_config "biome.json"
#
#   # Require tool binary
#   runner_require_tool "biome" "node_modules/.bin/biome"
#
#   # Collect targets (auto-detects mode)
#   runner_collect_targets "*.js|*.ts|*.json"
#
#   # Skip if no targets
#   runner_skip_if_no_targets || exit 0
#
#   # Execute tool
#   runner_exec "${RUNNER_TOOL_BIN}" check "${RUNNER_TARGETS[@]}"
#
# EXPORTS
# -----------------------------------------------------------------------------
# Variables:
#   RUNNER_ID        - Runner identifier (e.g., "lint.biome")
#   RUNNER_TITLE     - Display title (e.g., "BIOME")
#   RUNNER_DESC      - Description
#   RUNNER_MODE      - Execution mode: "staged", "pr", "full"
#   RUNNER_TARGETS   - Array of target files/directories
#   RUNNER_TOOL_BIN  - Path to tool binary
#   RUNNER_CONFIG    - Path to config file
#   RUNNER_STATUS    - Current status: "INIT", "RUNNING", "PASS", "FAIL", etc.
#
# Functions:
#   runner_init()              - Initialize runner context
#   runner_require_config()    - Require and validate config file
#   runner_require_tool()      - Require and locate tool binary
#   runner_collect_targets()   - Collect files based on mode
#   runner_skip_if_no_targets() - Skip if no targets found
#   runner_exec()              - Execute tool with logging
#   runner_set_status()        - Set runner status
#   runner_finish()            - Finalize runner and report
#
# ==============================================================================
set -euo pipefail

# Prevent double-sourcing
[[ -n "${_PS_RUNNER_BASE_LOADED:-}" ]] && return 0
_PS_RUNNER_BASE_LOADED=1

# -----------------------------------------------------------------------------
# Dependencies
# -----------------------------------------------------------------------------
_runner_base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Core dependencies (in order)
# shellcheck source=tools/scripts/core/path-resolution.sh
. "${_runner_base_dir}/path-resolution.sh"
# shellcheck source=tools/scripts/core/logging.sh
. "${_runner_base_dir}/logging.sh"
# shellcheck source=tools/scripts/core/validation.sh
. "${_runner_base_dir}/validation.sh"
# shellcheck source=tools/scripts/core/time-helpers.sh
. "${_runner_base_dir}/time-helpers.sh"

# Load branding if available
if [[ -f "${_runner_base_dir}/../branding/format.sh" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${_runner_base_dir}/../branding/format.sh" || true
fi

# -----------------------------------------------------------------------------
# Runner State
# -----------------------------------------------------------------------------
RUNNER_ID=""
RUNNER_TITLE=""
RUNNER_DESC=""
RUNNER_MODE=""
RUNNER_CONFIG=""
RUNNER_TOOL_BIN=""
RUNNER_STATUS="INIT"
RUNNER_START_MS=""
RUNNER_TARGET_COUNT=0
declare -a RUNNER_TARGETS=()
declare -a RUNNER_ARGS=()

# Export for child processes
export RUNNER_ID RUNNER_TITLE RUNNER_DESC RUNNER_MODE RUNNER_STATUS

# -----------------------------------------------------------------------------
# Standard exclusion patterns
# -----------------------------------------------------------------------------
RUNNER_EXCLUDE_PATTERN="*/node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/reports/*|*/.git/hooks/*"
export RUNNER_EXCLUDE_PATTERN

# Check if path matches exclusion patterns
runner_is_excluded_path() {
  local p="$1"
  case "${p}" in
    */node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/reports/*|*/.git/hooks/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Initialization
# -----------------------------------------------------------------------------

# runner_init <id> <title> [description]
# Initialize runner context with logging
runner_init() {
  local id="${1:?runner_init requires id}"
  local title="${2:?runner_init requires title}"
  local desc="${3:-}"

  RUNNER_ID="${id}"
  RUNNER_TITLE="${title}"
  RUNNER_DESC="${desc}"
  RUNNER_STATUS="INIT"
  RUNNER_TARGETS=()
  RUNNER_TARGET_COUNT=0
  
  # Set log component for structured logging
  PS_LOG_COMPONENT="${id}"
  export PS_LOG_COMPONENT
  
  # Capture start time
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    RUNNER_START_MS="$(ps_epoch_ms)"
  else
    RUNNER_START_MS="$(date +%s)000"
  fi

  # Determine execution mode
  _runner_determine_mode

  # Log start
  log_debug "Runner ${id} initialized (mode=${RUNNER_MODE})"
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info runner.start \
      "id=${id}" \
      "title=${title}" \
      ${desc:+"detail=${desc}"} \
      "mode=${RUNNER_MODE}"
  fi

  return 0
}

# Determine execution mode based on environment
_runner_determine_mode() {
  # Check for explicit full scan
  if [[ "${PS_FULL_SCAN:-0}" == "1" ]]; then
    RUNNER_MODE="full"
    return 0
  fi

  # Check if we have git
  if ! ps_git_has_repo; then
    RUNNER_MODE="full"
    return 0
  fi

  # Check for PR context
  if [[ "${CI:-0}" == "1" ]]; then
    if [[ -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
      RUNNER_MODE="pr"
      return 0
    fi
    # In CI without PR context, default to full scan
    RUNNER_MODE="full"
    return 0
  fi

  # Local development: use staged files
  RUNNER_MODE="staged"
  return 0
}

# -----------------------------------------------------------------------------
# Configuration & Tool Discovery
# -----------------------------------------------------------------------------

# runner_require_config <relative_path> [config_name]
# Require a configuration file, exit with ERROR if not found
runner_require_config() {
  local relative_path="${1:?runner_require_config requires path}"
  local config_name="${2:-config}"
  local full_path="${PS_REPO_ROOT}/${relative_path}"

  if [[ ! -f "${full_path}" ]]; then
    RUNNER_STATUS="ERROR"
    log_error "${config_name} not found: ${full_path}"
    _runner_finish_with_status "ERROR" 1
    exit 1
  fi

  RUNNER_CONFIG="${full_path}"
  log_debug "Config found: ${full_path}"
  return 0
}

# runner_require_tool <tool_name> [local_path] [global_fallback]
# Require a tool binary, prefer local over global
# Args:
#   tool_name      - Display name for error messages
#   local_path     - Relative path to local binary (e.g., "node_modules/.bin/biome")
#   global_fallback - If "1", allow falling back to PATH (default: 0)
runner_require_tool() {
  local tool_name="${1:?runner_require_tool requires tool_name}"
  local local_path="${2:-}"
  local global_fallback="${3:-0}"

  RUNNER_TOOL_BIN=""

  # Try local path first
  if [[ -n "${local_path}" ]]; then
    local full_local="${PS_REPO_ROOT}/${local_path}"
    if [[ -x "${full_local}" ]]; then
      RUNNER_TOOL_BIN="${full_local}"
      log_debug "Tool ${tool_name} found at: ${full_local}"
      return 0
    fi
  fi

  # Try global PATH if allowed
  if [[ "${global_fallback}" == "1" ]]; then
    if command -v "${tool_name}" >/dev/null 2>&1; then
      RUNNER_TOOL_BIN="$(command -v "${tool_name}")"
      log_debug "Tool ${tool_name} found on PATH: ${RUNNER_TOOL_BIN}"
      return 0
    fi
  fi

  # Tool not found
  RUNNER_STATUS="ERROR"
  log_error "${tool_name} is required but not found"
  if [[ -n "${local_path}" ]]; then
    log_info "Expected at: ${PS_REPO_ROOT}/${local_path}"
    log_info "Fix: npm ci (or install ${tool_name})"
  fi
  _runner_finish_with_status "ERROR" 1
  exit 1
}

# -----------------------------------------------------------------------------
# Target Collection
# -----------------------------------------------------------------------------

# runner_collect_targets <pattern>
# Collect targets based on current mode
# Pattern is a shell glob with | for alternatives (e.g., "*.js|*.ts")
runner_collect_targets() {
  local pattern="${1:?runner_collect_targets requires pattern}"
  RUNNER_TARGETS=()

  case "${RUNNER_MODE}" in
    full)
      _runner_collect_full "${pattern}"
      ;;
    pr)
      _runner_collect_pr "${pattern}"
      ;;
    staged)
      _runner_collect_staged "${pattern}"
      ;;
    *)
      log_error "Unknown runner mode: ${RUNNER_MODE}"
      return 1
      ;;
  esac

  RUNNER_TARGET_COUNT="${#RUNNER_TARGETS[@]}"
  log_debug "Collected ${RUNNER_TARGET_COUNT} targets (mode=${RUNNER_MODE})"
  return 0
}

# Collect all matching files (full scan)
_runner_collect_full() {
  local pattern="$1"
  
  # Convert pattern to find arguments
  local -a find_args=()
  IFS='|' read -ra patterns <<< "${pattern}"
  
  for ((i = 0; i < ${#patterns[@]}; i++)); do
    if [[ $i -gt 0 ]]; then
      find_args+=("-o")
    fi
    find_args+=("-name" "${patterns[$i]}")
  done

  while IFS= read -r -d '' f; do
    runner_is_excluded_path "${f}" && continue
    RUNNER_TARGETS+=("${f}")
  done < <(
    find "${PS_REPO_ROOT}" -type f \( "${find_args[@]}" \) \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -not -path "*/build/*" \
      -not -path "*/coverage/*" \
      -not -path "*/reports/*" \
      -print0 2>/dev/null || true
  )

  return 0
}

# Collect PR diff targets
_runner_collect_pr() {
  local pattern="$1"
  local base_sha="${PS_PR_BASE_SHA:-}"
  local head_sha="${PS_PR_HEAD_SHA:-}"

  if [[ -z "${base_sha}" || -z "${head_sha}" ]]; then
    log_debug "No PR SHAs available, falling back to full scan"
    _runner_collect_full "${pattern}"
    return 0
  fi

  # Ensure commits exist locally
  if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null || \
     ! git cat-file -e "${head_sha}^{commit}" 2>/dev/null; then
    # Try to fetch
    git fetch --no-tags --depth=1 origin "${base_sha}" 2>/dev/null || true
    git fetch --no-tags --depth=1 origin "${head_sha}" 2>/dev/null || true
  fi

  # Get diff files
  local -a diff_files=()
  if git cat-file -e "${base_sha}^{commit}" 2>/dev/null && \
     git cat-file -e "${head_sha}^{commit}" 2>/dev/null; then
    while IFS= read -r f; do
      diff_files+=("${f}")
    done < <(git diff --name-only "${base_sha}" "${head_sha}" 2>/dev/null || true)
  else
    # Fallback to HEAD~1..HEAD
    while IFS= read -r f; do
      diff_files+=("${f}")
    done < <(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
  fi

  # Filter by pattern
  for f in "${diff_files[@]:-}"; do
    [[ -z "${f}" ]] && continue
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern})
        local full_path="${PS_REPO_ROOT}/${f}"
        [[ -f "${full_path}" ]] && RUNNER_TARGETS+=("${full_path}")
        ;;
    esac
  done

  return 0
}

# Collect staged files
_runner_collect_staged() {
  local pattern="$1"

  # In CI with PR context, delegate to PR mode
  if [[ "${CI:-0}" == "1" && -n "${PS_PR_BASE_SHA:-}" && -n "${PS_PR_HEAD_SHA:-}" ]]; then
    _runner_collect_pr "${pattern}"
    return 0
  fi

  # Get staged files (NUL-safe)
  local -a staged_files=()
  while IFS= read -r -d '' f; do
    staged_files+=("${f}")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z 2>/dev/null || true)

  # Filter by pattern
  for f in "${staged_files[@]:-}"; do
    [[ -z "${f}" ]] && continue
    # shellcheck disable=SC2254
    case "${f}" in
      ${pattern})
        local full_path="${PS_REPO_ROOT}/${f}"
        [[ -f "${full_path}" ]] && RUNNER_TARGETS+=("${full_path}")
        ;;
    esac
  done

  return 0
}

# runner_skip_if_no_targets [message]
# Returns 0 (success) if should skip, 1 if targets exist
runner_skip_if_no_targets() {
  local message="${1:-No files to check}"
  
  if [[ "${#RUNNER_TARGETS[@]}" -eq 0 ]]; then
    RUNNER_STATUS="SKIPPED"
    log_info "${RUNNER_TITLE}: ${message}"
    _runner_finish_with_status "SKIPPED" 0
    return 0
  fi
  
  return 1
}

# Get targets as full-scan root or individual files
runner_get_targets_for_tool() {
  if [[ "${RUNNER_MODE}" == "full" ]]; then
    echo "${PS_REPO_ROOT}"
  else
    printf '%s\n' "${RUNNER_TARGETS[@]}"
  fi
}

# -----------------------------------------------------------------------------
# Execution
# -----------------------------------------------------------------------------

# runner_exec <command...>
# Execute tool command with proper logging and status handling
runner_exec() {
  RUNNER_STATUS="RUNNING"
  
  local rc=0
  set +e
  "$@"
  rc=$?
  set -e

  # Evaluate status based on exit code
  if [[ ${rc} -eq 0 ]]; then
    RUNNER_STATUS="PASS"
  else
    RUNNER_STATUS="FAIL"
  fi

  _runner_finish_with_status "${RUNNER_STATUS}" "${rc}"
  return ${rc}
}

# runner_exec_with_output <log_file> <command...>
# Execute tool command and capture output
runner_exec_with_output() {
  local log_file="${1:?runner_exec_with_output requires log_file}"
  shift
  
  RUNNER_STATUS="RUNNING"
  mkdir -p "$(dirname "${log_file}")"
  
  local rc=0
  set +e
  "$@" > "${log_file}" 2>&1
  rc=$?
  set -e

  # Evaluate status
  RUNNER_STATUS="$(_runner_evaluate_status "${rc}" "${log_file}")"
  
  _runner_finish_with_status "${RUNNER_STATUS}" "${rc}"
  return ${rc}
}

# Evaluate exit code and log file to determine status
_runner_evaluate_status() {
  local rc="$1"
  local log_file="$2"
  local status="PASS"

  # Check for skip indicators
  if [[ -f "${log_file}" ]] && grep -Eiq "no .*files to check|no .*files to lint|no .*files found|no staged" "${log_file}"; then
    echo "SKIPPED"
    return 0
  fi

  if [[ ${rc} -ne 0 ]]; then
    status="FAIL"
    
    # Check for configuration errors
    if [[ -f "${log_file}" ]] && grep -Eiq "config not found|cannot read config|invalid configuration|configuration error|failed to load config|command not found|Cannot find module" "${log_file}"; then
      status="ERROR"
    fi
  fi

  echo "${status}"
  return 0
}

# -----------------------------------------------------------------------------
# Status & Finish
# -----------------------------------------------------------------------------

# runner_set_status <status>
# Manually set runner status
runner_set_status() {
  RUNNER_STATUS="${1:?runner_set_status requires status}"
  return 0
}

# Finalize runner with status and exit code
_runner_finish_with_status() {
  local status="$1"
  local rc="${2:-0}"
  
  # Calculate duration
  local end_ms=""
  local duration_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  else
    end_ms="$(date +%s)000"
  fi
  if [[ -n "${RUNNER_START_MS:-}" ]]; then
    duration_ms=$((end_ms - RUNNER_START_MS))
  fi

  # Log finish
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info runner.finish \
      "id=${RUNNER_ID}" \
      "title=${RUNNER_TITLE}" \
      "status=${status}" \
      "exit_code=${rc}" \
      "target_count=${RUNNER_TARGET_COUNT}" \
      ${duration_ms:+"duration_ms=${duration_ms}"} \
      "mode=${RUNNER_MODE}"
  fi

  log_debug "Runner ${RUNNER_ID} finished: status=${status} rc=${rc}"
  return 0
}

# runner_finish [status]
# Explicit finish call (optional, called automatically by runner_exec)
runner_finish() {
  local status="${1:-${RUNNER_STATUS}}"
  local rc=0
  [[ "${status}" == "FAIL" || "${status}" == "ERROR" ]] && rc=1
  _runner_finish_with_status "${status}" "${rc}"
  return 0
}

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

# runner_parse_args <args...>
# Parse common runner arguments (--write, --fix, etc.)
runner_parse_args() {
  RUNNER_ARGS=()
  for arg in "$@"; do
    [[ -n "${arg}" ]] && RUNNER_ARGS+=("${arg}")
  done
  return 0
}

# runner_get_relative_targets
# Get targets as relative paths (for display)
runner_get_relative_targets() {
  local target
  for target in "${RUNNER_TARGETS[@]:-}"; do
    if [[ "${target}" == "${PS_REPO_ROOT}/"* ]]; then
      echo "${target#"${PS_REPO_ROOT}"/}"
    else
      echo "${target}"
    fi
  done
}

return 0
