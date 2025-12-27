#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Run
# ------------------------------------------------------------------------------
# Purpose:
#   Run a repository script with standardized logging.
# ==============================================================================


workspace_root="${GITHUB_WORKSPACE:-$(pwd)}"
: "${PS_PLATFORM_ROOT:?PS_PLATFORM_ROOT must be set by the workflow (path to checked-out platform repo)}"
platform_root="${PS_PLATFORM_ROOT}"

if [[ ! -d "${platform_root}" ]]; then
  printf 'ERROR: PS_PLATFORM_ROOT directory not found: %s\n' "${platform_root}" >&2
  exit 1
fi

# Resolve print-section.sh (prefer platform, allow workspace fallback for dev/bootstrap).
section_script=""
for candidate in \
  "${platform_root}/tools/scripts/branding/print-section.sh" \
  "${workspace_root}/tools/scripts/branding/print-section.sh"; do
  if [[ -f "${candidate}" ]]; then
    section_script="${candidate}"
    break
  fi
done

if [[ -z "${section_script}" ]]; then
  printf 'ERROR: print-section.sh not found.\n' >&2
  printf 'Tried: %s\n' "${platform_root}/tools/scripts/branding/print-section.sh" >&2
  printf 'Tried: %s\n' "${workspace_root}/tools/scripts/branding/print-section.sh" >&2
  exit 1
fi

rel_script="${PS_REL_SCRIPT:-}"
if [[ -z "${rel_script}" ]]; then
  printf 'ERROR: inputs.script is required\n' >&2
  exit 1
fi

# Disallow absolute paths and traversal.
if [[ "${rel_script}" = /* ]] || [[ "${rel_script}" == *".."* ]]; then
  printf 'ERROR: inputs.script must be a relative path within the platform repo (no traversal).\n' >&2
  printf 'Got: %s\n' "${rel_script}" >&2
  exit 1
fi

target="${platform_root}/${rel_script}"
if [[ ! -f "${target}" ]]; then
  printf 'ERROR: script not found: %s\n' "${target}" >&2
  exit 1
fi

rel_wd="${PS_REL_WD:-}"
if [[ -z "${rel_wd}" ]]; then
  rel_wd="."
fi

if [[ "${rel_wd}" = /* ]] || [[ "${rel_wd}" == *".."* ]]; then
  printf 'ERROR: inputs.working-directory must be a relative path within the workspace (no traversal).\n' >&2
  printf 'Got: %s\n' "${rel_wd}" >&2
  exit 1
fi

wd="${workspace_root}/${rel_wd}"
if [[ ! -d "${wd}" ]]; then
  printf 'ERROR: working directory does not exist: %s\n' "${wd}" >&2
  exit 1
fi

printf 'PS.RUN: platform_root=%q\n' "$platform_root"
printf 'PS.RUN: script=%q\n' "$rel_script"
printf 'PS.RUN: working_directory=%q\n' "$rel_wd"

# Validate id/title and persist for downstream steps
if [[ -z "${PS_ID:-}" ]]; then
  printf 'ERROR: inputs.id is required\n' >&2
  exit 1
fi
if ! [[ "${PS_ID}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf 'ERROR: inputs.id must match ^[A-Za-z0-9._-]+$\n' >&2
  exit 1
fi
if [[ -z "${PS_TITLE:-}" ]]; then
  printf 'ERROR: inputs.title is required\n' >&2
  exit 1
fi

emit_env() {
  local key="$1"
  local val="$2"
  local sanitized delimiter attempts
  sanitized="${val//$'\r'/}"
  delimiter="__PS_ENV_${RANDOM}_${RANDOM}__"
  attempts=0
  while [[ "${sanitized}" == *"${delimiter}"* ]]; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -gt 6 ]]; then
      printf 'ERROR: env value for %s contains an unsafe heredoc delimiter\n' "${key}" >&2
      exit 1
    fi
    delimiter="__PS_ENV_${RANDOM}_${RANDOM}__"
  done
  printf '%s<<%s\n%s\n%s\n' "${key}" "${delimiter}" "${sanitized}" "${delimiter}" >> "${GITHUB_ENV}"
  return 0
}

emit_env "PS_RUN_ID" "${PS_ID}"
emit_env "PS_RUN_TITLE" "${PS_TITLE}"
emit_env "PS_RUN_DESCRIPTION" "${PS_DESCRIPTION}"

# Security logging helper: sanitize and timestamp events; write to ${log_abs} if available
log_security_event() {
  local level="$1"; shift
  local msg="$*"
  # remove CR/LF and non-printable characters
  msg="$(printf '%s' "${msg}" | tr -d '\r\n' | tr -c '[:print:]\t' ' ')
"
  local ts
  ts="$(date -u +%FT%T%z 2>/dev/null || date -u +%FT%T)"
  if [[ -n "${log_abs:-}" ]]; then
    printf '%s %s %s\n' "${ts}" "${level}" "${msg}" >> "${log_abs}"
  else
    printf '%s %s %s\n' "${ts}" "${level}" "${msg}"
  fi
  return 0
}

bash "${section_script}" "${PS_ID}" "${PS_TITLE}" "${PS_DESCRIPTION}"

# Log task identification for audit trail
log_security_event "EVENT" "task_id=${PS_ID} title=${PS_TITLE}"

cd "${wd}"

# Basic security logging: env_kv (if present) and args counts
env_kv="${PS_ENV_KV:-}"
if [[ -n "${env_kv}" ]]; then
  env_kv_count=$(printf '%s\n' "${env_kv}" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
  # enforce limits in helper when invoked standalone
  if (( env_kv_count > 100 )); then
    printf 'ERROR: env_kv has too many entries (%s)\n' "${env_kv_count}" >&2
    exit 1
  fi
  total_bytes=0
  nul_char=$'\0'
  while IFS= read -r line; do
    entry="${line}"
    [[ -z "${entry}" ]] && continue
    value="${entry#*=}"
    value="${value//$'\r'/}"
    if [[ -n "${nul_char}" && "${value}" == *"${nul_char}"* ]]; then
      printf 'ERROR: env_kv value must not contain NUL bytes (entry: %s)\n' "${entry%%=*}" >&2
      exit 1
    fi
    val_len=${#value}
    if (( val_len > 65536 )); then
      printf 'ERROR: env_kv value too large (entry: %s)\n' "${entry%%=*}" >&2
      exit 1
    fi
    total_bytes=$((total_bytes + val_len))
    if (( total_bytes > 262144 )); then
      printf 'ERROR: env_kv total size too large\n' >&2
      exit 1
    fi
  done <<< "${env_kv}"
else
  env_kv_count=0
fi
log_security_event "EVENT" "env_kv_processed count=${env_kv_count}"

args="${PS_ARGS:-}"
if [[ -n "${args}" ]]; then
  # Intentional word-splitting: args is a workflow-author-controlled string.
  # Split into an array safely to preserve quoting semantics.
  read -r -a args_arr <<< "${args}"
  args_count=${#args_arr[@]}
  log_security_event "EVENT" "args_processed count=${args_count}"
  # Log script execution and working directory
  log_security_event "EVENT" "script_execution path=${rel_script} working_directory=${rel_wd}"
  bash "${target}" -- "${args_arr[@]}"
else
  args_count=0
  log_security_event "EVENT" "args_processed count=0"
  # Log script execution and working directory
  log_security_event "EVENT" "script_execution path=${rel_script} working_directory=${rel_wd}"
  bash "${target}"
fi

printf 'PS.RUN: OK\n'
