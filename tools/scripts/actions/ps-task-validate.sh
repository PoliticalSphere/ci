#!/usr/bin/env bash
set -euo pipefail

case "${PS_TASK_ALLOW_ARGS:-}" in
  0|1) ;;
  *) echo "ERROR: inputs.allow_args must be '0' or '1'." >&2; exit 1 ;;
 esac

if [[ "${PS_TASK_ALLOW_ARGS}" == "0" && -n "${PS_TASK_ARGS:-}" ]]; then
  echo "ERROR: args provided but inputs.allow_args=0 (denied)" >&2
  exit 1
fi

case "${PS_TASK_VALIDATE_PATHS:-}" in
  0|1) ;;
  *) echo "ERROR: inputs.validate_paths must be '0' or '1'." >&2; exit 1 ;;
 esac

printf 'PS.TASK: id=%q title=%q script=%q working_directory=%q\n' \
  "${PS_TASK_ID}" "${PS_TASK_TITLE}" "${PS_TASK_SCRIPT}" "${PS_TASK_WD}"
if [[ -n "${PS_TASK_DESC:-}" ]]; then
  printf 'PS.TASK: description=%q\n' "${PS_TASK_DESC}"
fi
