#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Centralized Logging
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/core/logging.sh
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
# Provides standardized logging functions for all scripts:
#   - Consistent formatting across all scripts
#   - Log level filtering (debug, info, warn, error)
#   - Integration with branding/format.sh when available
#   - Support for structured logging in CI environments
#
# USAGE
# -----------------------------------------------------------------------------
#   log_debug "Verbose debug message"
#   log_info "Informational message"
#   log_warn "Warning message"
#   log_error "Error message"
#
# CONFIGURATION
# -----------------------------------------------------------------------------
# Environment variables:
#   - PS_LOG_LEVEL: Minimum log level (debug|info|warn|error) [default: info]
#   - PS_LOG_PREFIX: Prefix for log messages [default: PS]
#   - PS_LOG_TIMESTAMP: Include timestamp (0|1) [default: 0]
#
# ==============================================================================

# Prevent double-sourcing
[[ -n "${PS_LOGGING_LOADED:-}" ]] && return 0
PS_LOGGING_LOADED=1

# -----------------------------------------------------------------------------
# Configuration with defaults
# -----------------------------------------------------------------------------
PS_LOG_LEVEL="${PS_LOG_LEVEL:-info}"
PS_LOG_PREFIX="${PS_LOG_PREFIX:-PS}"
PS_LOG_TIMESTAMP="${PS_LOG_TIMESTAMP:-0}"

# Log level numeric values for comparison
# Note: Using case statement instead of associative array for set -u compatibility
_ps_log_level_value() {
  local level="${1:-info}"
  case "${level}" in
    debug) echo 0 ;;
    info)  echo 1 ;;
    warn)  echo 2 ;;
    error) echo 3 ;;
    *)     echo 1 ;;  # Default to info level
  esac
}

# -----------------------------------------------------------------------------
# Internal helpers
# -----------------------------------------------------------------------------
_ps_should_log() {
  local msg_level="$1"
  local min_level="${PS_LOG_LEVEL}"
  local msg_val
  local min_val
  msg_val="$(_ps_log_level_value "${msg_level}")"
  min_val="$(_ps_log_level_value "${min_level}")"
  [[ "${msg_val}" -ge "${min_val}" ]]
}

_ps_format_timestamp() {
  if [[ "${PS_LOG_TIMESTAMP}" == "1" ]]; then
    date -u '+%Y-%m-%dT%H:%M:%SZ '
  fi
}

# -----------------------------------------------------------------------------
# Public logging functions
# -----------------------------------------------------------------------------

# log_debug - Debug level logging (verbose, only when PS_LOG_LEVEL=debug)
log_debug() {
  _ps_should_log "debug" || return 0
  local ts
  ts="$(_ps_format_timestamp)"
  if type -t ps_detail >/dev/null 2>&1; then
    ps_detail "$*"
  else
    printf '%s[%s] DEBUG: %s\n' "${ts}" "${PS_LOG_PREFIX}" "$*" >&2
  fi
}

# log_info - Informational logging (default level)
log_info() {
  _ps_should_log "info" || return 0
  local ts
  ts="$(_ps_format_timestamp)"
  if type -t ps_info >/dev/null 2>&1; then
    ps_info "$*"
  else
    printf '%s[%s] %s\n' "${ts}" "${PS_LOG_PREFIX}" "$*"
  fi
}

# log_warn - Warning logging
log_warn() {
  _ps_should_log "warn" || return 0
  local ts
  ts="$(_ps_format_timestamp)"
  if type -t ps_warn >/dev/null 2>&1; then
    ps_warn "$*"
  else
    printf '%s[%s] WARN: %s\n' "${ts}" "${PS_LOG_PREFIX}" "$*" >&2
  fi
}

# log_error - Error logging (always logged unless PS_LOG_LEVEL=none)
log_error() {
  _ps_should_log "error" || return 0
  local ts
  ts="$(_ps_format_timestamp)"
  if type -t ps_error >/dev/null 2>&1; then
    ps_error "$*"
  else
    printf '%s[%s] ERROR: %s\n' "${ts}" "${PS_LOG_PREFIX}" "$*" >&2
  fi
}

# -----------------------------------------------------------------------------
# Aliases for compatibility
# -----------------------------------------------------------------------------
# Some scripts may use these names
info() { log_info "$@"; }
warn() { log_warn "$@"; }
error() { log_error "$@"; }
debug() { log_debug "$@"; }

return 0
