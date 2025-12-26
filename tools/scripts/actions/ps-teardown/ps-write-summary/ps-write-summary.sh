#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS Write Summary
# ------------------------------------------------------------------------------
# Purpose:
#   Write teardown summary output.
# ==============================================================================


workflow="${PS_SUMMARY_WORKFLOW:-}"
output_path="${PS_SUMMARY_OUTPUT_PATH:-}"
results_block="${PS_SUMMARY_RESULTS:-}"

if [[ -z "${workflow}" || -z "${output_path}" || -z "${results_block}" ]]; then
  echo "ERROR: workflow, output_path, and results are required." >&2
  exit 1
fi

status_failure="failure"
overall="success"
keys=()
vals=()

while IFS= read -r line; do
  [[ -z "${line}" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"

  if [[ "${key}" == "${line}" ]]; then
    printf "ERROR: invalid results entry '%s' (expected key=value).\n" "${line}" >&2
    exit 1
  fi

  if [[ ! "${key}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    printf "ERROR: invalid result key '%s'.\n" "${key}" >&2
    exit 1
  fi

  case "${val}" in
    success|failure|cancelled|skipped) ;;
    *)
      printf "ERROR: invalid result value '%s' for '%s'.\n" "${val}" "${key}" >&2
      exit 1
      ;;
  esac

  keys+=("${key}")
  vals+=("${val}")

  # Determine overall status with precedence: failure > skipped > cancelled > success
  if [[ "${val}" == "${status_failure}" ]]; then
    overall="${status_failure}"
  elif [[ "${val}" == "skipped" && "${overall}" != "${status_failure}" ]]; then
    overall="skipped"
  elif [[ "${val}" == "cancelled" && "${overall}" != "${status_failure}" && "${overall}" != "skipped" ]]; then
    overall="cancelled"
  fi
 done <<< "${results_block}"

output_dir="$(dirname "${output_path}")"
mkdir -p "${output_dir}"

json="{\"workflow\":\"${workflow}\",\"status\":\"${overall}\",\"results\":{"
for i in "${!keys[@]}"; do
  key="${keys[$i]}"
  val="${vals[$i]}"
  if [[ "${i}" -gt 0 ]]; then
    json+=","
  fi
  json+="\"${key}\":\"${val}\""
done
json+="}}"

printf '%s\n' "${json}" > "${output_path}"
printf 'PS.SUMMARY: workflow=%s\n' "${workflow}"
printf 'PS.SUMMARY: output=%s\n' "${output_path}"
printf 'PS.SUMMARY: status=%s\n' "${overall}"
