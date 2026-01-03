#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Lint: Affected Runner
# ------------------------------------------------------------------------------
# Purpose:
#   Run one or more linter scripts against the PR-affected file set (or staged
#   files when appropriate). In CI this uses PS_PR_BASE_SHA/PS_PR_HEAD_SHA; when
#   run locally this script computes a sensible base (merge-base with the
#   upstream ref or origin/HEAD) and sets CI=1 so downstream helpers prefer
#   PR-diff targets.
#
# Usage:
#   ./affected.sh            # run all linters against affected files
#   ./affected.sh --fix      # run fix-capable linters with fix options
#   ./affected.sh eslint     # run only eslint against affected files
#   ./affected.sh eslint --fix
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/runners/lint/common.sh
. "${script_dir}/common.sh"

set_repo_root_and_git
assert_lint_egress_allowed
PS_LOG_COMPONENT="lint.affected"

# Force CI mode so collect_targets_staged prefers PR diffs when PS_PR_* set.
export CI=1

# If PS_PR_* not provided, try to compute a base against upstream or origin/HEAD
if [[ -z "${PS_PR_BASE_SHA:-}" || -z "${PS_PR_HEAD_SHA:-}" ]] && ps_git_has_repo; then
  base_ref=""
  if upstream_ref="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
    base_ref="${upstream_ref}"
  fi
  if [[ -z "${base_ref}" ]]; then
    origin_head_ref="$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null || true)"
    if [[ -n "${origin_head_ref}" ]]; then
      base_ref="${origin_head_ref#refs/remotes/}"
    fi
  fi
  if [[ -z "${base_ref}" ]]; then
    ps_error "unable to resolve a base ref (set PS_PR_BASE_SHA/PS_PR_HEAD_SHA or configure an upstream)."
    exit 1
  fi

  base_ref="${base_ref#refs/remotes/}"
  if [[ "${base_ref}" != */* ]]; then
    ps_error "base ref '${base_ref}' is not a remote ref (expected origin/<branch>)."
    exit 1
  fi

  remote="${base_ref%%/*}"
  branch="${base_ref#*/}"
  if ! git show-ref --verify --quiet "refs/remotes/${base_ref}"; then
    retry_cmd 3 2 git fetch --no-tags --depth=1 "${remote}" "${branch}" >/dev/null 2>&1 || true
  fi

  if git show-ref --verify --quiet "refs/remotes/${base_ref}"; then
    PS_PR_BASE_SHA="$(git merge-base "${base_ref}" HEAD)" || PS_PR_BASE_SHA="$(git rev-parse --verify HEAD)"
  else
    ps_error "base ref '${base_ref}' is unavailable (set PS_PR_BASE_SHA/PS_PR_HEAD_SHA)."
    exit 1
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
      ps_error "Unknown arg: ${arg}"
      exit 2 ;;
  esac
done

if [[ ${#LA[@]} -eq 0 ]]; then
  LA=("${VALID_LINTERS[@]}")
fi

affected_start_ms=""
if command -v ps_epoch_ms >/dev/null 2>&1; then
  affected_start_ms="$(ps_epoch_ms)"
fi
lint_list="$(printf '%s,' "${LA[@]}")"
lint_list="${lint_list%,}"
if command -v ps_log >/dev/null 2>&1; then
  ps_log info lint.runner.start \
    "id=lint.affected" \
    "linters=${lint_list}" \
    "fix=${FIX}"
fi

# shellcheck disable=SC2329
lint_affected_finish() {
  local rc="${1:-0}"
  local status="PASS"
  local end_ms=""
  local duration_ms=""
  if [[ "${rc}" -ne 0 ]]; then
    status="FAIL"
  fi
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  fi
  if [[ -n "${affected_start_ms}" && -n "${end_ms}" ]]; then
    duration_ms=$((end_ms - affected_start_ms))
  fi
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info lint.runner.finish \
      "id=lint.affected" \
      "status=${status}" \
      "exit_code=${rc}" \
      "linters=${lint_list}" \
      "fix=${FIX}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi
  return 0
}
trap 'lint_affected_finish $?' EXIT

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
  ps_info "Running linter: ${l} (fix=${FIX})"
  run_linter "${l}" "${FIX}"
done

exit 0
