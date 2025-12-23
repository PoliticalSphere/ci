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

export CI="${CI:-0}"
branding_script="${repo_root}/tools/scripts/branding/print-section.sh"

tests_dir="${repo_root}/tools/tests"
if [[ ! -d "${tests_dir}" ]]; then
  if [[ "${CI}" == "1" ]]; then
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

# Discover all test files under tools/tests and run them (portable)
found_any=0
test_files=()
while IFS= read -r -d '' f; do
  test_files+=("${f}")
done < <(find "${tests_dir}" -maxdepth 1 -type f -name '*.test.js' -print0 | sort -z)

if [[ "${#test_files[@]}" -gt 0 ]]; then
  found_any=1
  if [[ -x "${branding_script}" ]]; then
    bash "${branding_script}" "tests" "Running tests" "tools/tests"
  else
    echo "Running tests: tools/tests"
  fi
  for f in "${test_files[@]}"; do
    if [[ -x "${branding_script}" ]]; then
      bash "${branding_script}" "test" "Running test" "$(basename "${f}")"
    else
      printf 'Running test: %q\n' "$(basename "${f}")"
    fi
    node "${f}"
  done
fi

if [[ ${found_any} -eq 0 ]]; then
  if [[ "${CI}" == "1" ]]; then
    error "test harness missing under tools/tests (CI requires tests)."
    exit 1
  fi
  detail "Tests: test harness not found (bootstrap mode)."
  detail "HINT: add deterministic tests under tools/tests/."
  exit 0
fi

if [[ -x "${branding_script}" ]]; then
  bash "${branding_script}" "tests.result" "Tests passed" "${#test_files[@]} test file(s) validated"
else
  count="${#test_files[@]}"
  printf 'Tests passed: %q\n' "${count} test file(s) validated"
fi
