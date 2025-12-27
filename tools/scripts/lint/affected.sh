#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Lint: Affected Runner
# ------------------------------------------------------------------------------
# Purpose:
#   Run one or more linter scripts against the PR-affected file set (or staged
#   files when appropriate). In CI this uses PS_PR_BASE_SHA/PS_PR_HEAD_SHA; when
#   run locally this script computes a sensible base (merge-base with
#   origin/main) and sets CI=1 so downstream helpers prefer PR-diff targets.
#
# Usage:
#   ./affected.sh            # run all linters against affected files
#   ./affected.sh --fix      # run fix-capable linters with fix options
#   ./affected.sh eslint     # run only eslint against affected files
#   ./affected.sh eslint --fix
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git

# Force CI mode so collect_targets_staged prefers PR diffs when PS_PR_* set.
export CI=1

# If PS_PR_* not provided, try to compute a base against origin/main
if [[ -z "${PS_PR_BASE_SHA:-}" || -z "${PS_PR_HEAD_SHA:-}" ]] && _ps_has_git; then
  # Ensure we have a ref for origin/main (best-effort; fetch shallowly if missing)
  if ! git show-ref --verify --quiet refs/remotes/origin/main; then
    retry_cmd 3 2 git fetch --no-tags --depth=1 origin main >/dev/null 2>&1 || true
  fi

  if git show-ref --verify --quiet refs/remotes/origin/main; then
    PS_PR_BASE_SHA="$(git merge-base origin/main HEAD)" || PS_PR_BASE_SHA="$(git rev-parse --verify HEAD)"
  else
    PS_PR_BASE_SHA="$(git rev-parse --verify HEAD)"
  fi
  PS_PR_HEAD_SHA="$(git rev-parse --verify HEAD)"

  export PS_PR_BASE_SHA PS_PR_HEAD_SHA
fi

# Parse args
FIX=0
# Supported short names:
VALID_LINTERS=(biome eslint yaml actionlint hadolint shellcheck markdown cspell knip)
LA=()
for arg in "$@"; do
  case "${arg}" in
    --fix) FIX=1 ;;
    biome|eslint|yaml|actionlint|hadolint|shellcheck|markdown|cspell|knip)
      LA+=("${arg}") ;;
    *)
      echo "Unknown arg: ${arg}" >&2
      exit 2 ;;
  esac
done

if [[ ${#LA[@]} -eq 0 ]]; then
  LA=("${VALID_LINTERS[@]}")
fi

# Helper: run linter by name
run_linter() {
  local name="$1"
  local fix_flag="$2"

  case "${name}" in
    biome)
      if [[ "${fix_flag}" -eq 1 ]]; then
        bash "${script_dir}/biome.sh" --write
      else
        bash "${script_dir}/biome.sh"
      fi
      ;;
    eslint)
      if [[ "${fix_flag}" -eq 1 ]]; then
        bash "${script_dir}/eslint.sh" --fix
      else
        bash "${script_dir}/eslint.sh"
      fi
      ;;
    yaml)
      bash "${script_dir}/yamllint.sh"
      ;;
    actionlint)
      bash "${script_dir}/actionlint.sh"
      ;;
    hadolint)
      bash "${script_dir}/hadolint.sh"
      ;;
    shellcheck)
      bash "${script_dir}/shellcheck.sh"
      ;;
    markdown)
      if [[ "${fix_flag}" -eq 1 ]]; then
        bash "${script_dir}/markdownlint.sh" --fix
      else
        bash "${script_dir}/markdownlint.sh"
      fi
      ;;
    cspell)
      bash "${script_dir}/cspell.sh"
      ;;
    knip)
      bash "${script_dir}/knip.sh"
      ;;
    *)
      echo "Unsupported linter: ${name}" >&2
      return 2
      ;;
  esac
}

# Run each selected linter
for l in "${LA[@]}"; do
  echo "Running linter: ${l} (fix=${FIX})"
  run_linter "${l}" "${FIX}"
done

exit 0
