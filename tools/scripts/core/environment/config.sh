#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Centralized Configuration
# ==============================================================================
# ps_header_v: 6
#
# IDENTITY
# -----------------------------------------------------------------------------
# meta:
#   file_id: tools/scripts/core/config.sh
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
# Centralized configuration for all scripts:
#   - Log levels and output formatting
#   - Feature flags and behavior toggles
#   - CI/CD environment detection
#   - Default values with environment override support
#
# USAGE
# -----------------------------------------------------------------------------
# Sourced automatically by bootstrap.sh, or directly:
#   . "${PS_CORE}/config.sh"
#
# Override any setting via environment variables before sourcing.
#
# ==============================================================================

# Prevent double-sourcing
[[ -n "${PS_CONFIG_LOADED:-}" ]] && return 0
PS_CONFIG_LOADED=1

# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
# Log level: debug, info, warn, error
export PS_LOG_LEVEL="${PS_LOG_LEVEL:-info}"

# Log prefix for messages
export PS_LOG_PREFIX="${PS_LOG_PREFIX:-PS}"

# Include timestamps in log output (0=off, 1=on)
export PS_LOG_TIMESTAMP="${PS_LOG_TIMESTAMP:-0}"

# -----------------------------------------------------------------------------
# Execution Behavior
# -----------------------------------------------------------------------------
# Strict mode enforcement (0=off, 1=on)
export PS_STRICT_MODE="${PS_STRICT_MODE:-1}"

# Dry run mode - skip destructive operations (0=off, 1=on)
export PS_DRY_RUN="${PS_DRY_RUN:-0}"

# Verbose output (0=off, 1=on)
export PS_VERBOSE="${PS_VERBOSE:-0}"

# -----------------------------------------------------------------------------
# CI/CD Environment Detection
# -----------------------------------------------------------------------------
# Detect if running in GitHub Actions
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  export PS_IN_CI=1
  export PS_CI_PLATFORM="github-actions"
else
  export PS_IN_CI=0
  export PS_CI_PLATFORM=""
fi

# Detect if running in a PR context
if [[ -n "${GITHUB_EVENT_NAME:-}" ]] && [[ "${GITHUB_EVENT_NAME}" == "pull_request" ]]; then
  export PS_IN_PR=1
else
  export PS_IN_PR=0
fi

# -----------------------------------------------------------------------------
# Path Configuration
# -----------------------------------------------------------------------------
# These are set by bootstrap.sh, but provide fallbacks here
export PS_SCRIPTS_ROOT="${PS_SCRIPTS_ROOT:-}"
export PS_REPO_ROOT="${PS_REPO_ROOT:-}"
export PS_CORE="${PS_CORE:-}"

# -----------------------------------------------------------------------------
# Tool Defaults
# -----------------------------------------------------------------------------
# Default timeout for commands (seconds)
export PS_CMD_TIMEOUT="${PS_CMD_TIMEOUT:-300}"

# Default retry count for transient failures
export PS_RETRY_COUNT="${PS_RETRY_COUNT:-3}"

# Default retry delay (seconds)
export PS_RETRY_DELAY="${PS_RETRY_DELAY:-2}"

# -----------------------------------------------------------------------------
# Feature Flags
# -----------------------------------------------------------------------------
# Enable color output (auto-detect TTY, or force with 1/0)
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
  export PS_COLOR="${PS_COLOR:-1}"
else
  export PS_COLOR="${PS_COLOR:-0}"
fi

# Enable progress indicators
export PS_PROGRESS="${PS_PROGRESS:-1}"

return 0
