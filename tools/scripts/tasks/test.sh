#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — Tests
# ------------------------------------------------------------------------------
# Purpose:
#   Run deterministic unit tests for the CI/CD platform.
#
# Policy:
#   - In CI: a real test harness must exist. Missing tests is a failure.
#   - Locally (bootstrap): if tests are not yet wired, exit cleanly with a clear
#     message to avoid blocking early development.
# ==============================================================================

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=tools/scripts/common.sh
. "${script_dir}/../common.sh"
init_repo_context

cd "${repo_root}"

CI="${CI:-0}"
branding_script="${repo_root}/tools/scripts/branding/print-section.sh"
tests_dir="${repo_root}/tools/tests"

current_test_file=""

on_error() {
  local rc=$?
  if [[ -n "${current_test_file}" ]]; then
    error "Test failed: $(basename "${current_test_file}") (exit ${rc})"
    detail_err "Path: ${current_test_file}"
  else
    error "Tests failed (exit ${rc})"
  fi
  exit "${rc}"
}
trap on_error ERR

if [[ ! -d "${tests_dir}" ]]; then
  if [[ "${CI}" != "0" ]]; then
    error "tools/tests not found (CI requires tests)."
    exit 1
  fi
  detail "Tests: tools/tests not found (bootstrap mode)."
  detail "HINT: add deterministic tests under tools/tests/."
  exit 0
fi

if [[ ! -f "${repo_root}/package.json" ]]; then
  error "package.json not found; cannot run tests."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  error "node is required but not found on PATH"
  exit 1
fi

# Discover test files (recursive) in a portable way.
# Avoid using sort -z (not portable on macOS/BSD). We collect unsorted, then sort with newline delim.
test_files=()
while IFS= read -r f; do
  test_files+=("$f")
done < <(find "${tests_dir}" -type f -name '*.test.js' -print | LC_ALL=C sort)

if [[ "${#test_files[@]}" -eq 0 ]]; then
  if [[ "${CI}" != "0" ]]; then
    error "test harness missing under tools/tests (CI requires tests)."
    exit 1
  fi
  detail "Tests: test harness not found (bootstrap mode)."
  detail "HINT: add deterministic tests under tools/tests/."
  exit 0
fi

if [[ -x "${branding_script}" ]]; then
  bash "${branding_script}" "tests" "Running tests" "tools/tests"
else
  echo "Running tests: tools/tests"
fi

for f in "${test_files[@]}"; do
  current_test_file="${f}"
  if [[ -x "${branding_script}" ]]; then
    bash "${branding_script}" "test" "Running test" "$(basename "${f}")"
  else
    printf 'Running test: %s\n' "$(basename "${f}")"
  fi
  node "${f}"
done

current_test_file=""

if [[ -x "${branding_script}" ]]; then
  bash "${branding_script}" "tests.result" "Tests passed" "${#test_files[@]} test file(s) validated"
else
  printf 'Tests passed: %s test file(s) validated\n' "${#test_files[@]}"
fi
