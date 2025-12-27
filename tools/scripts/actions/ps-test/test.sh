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
. "${script_dir}/../../common.sh"
init_repo_context

cd "${repo_root}"

CI="${CI:-0}"
branding_script="${repo_root}/tools/scripts/branding/print-section.sh"
tests_dir="${repo_root}/tools/tests"

current_test_file=""
declare -a junit_cases=()
junit_tests=0
junit_failures=0
junit_time=0
junit_enabled=0
junit_path=""

xml_escape() {
  local s="$1"
  s="${s//&/&amp;}"
  s="${s//</&lt;}"
  s="${s//>/&gt;}"
  s="${s//\"/&quot;}"
  s="${s//\'/&apos;}"
  printf '%s' "${s}"
  return 0
}

write_junit() {
  if [[ "${junit_enabled}" != "1" || -z "${junit_path}" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "${junit_path}")"
  {
    printf '<?xml version="1.0" encoding="UTF-8"?>\n'
    printf '<testsuite name="tools.tests" tests="%s" failures="%s" time="%s">\n' \
      "${junit_tests}" "${junit_failures}" "${junit_time}"
    for case in "${junit_cases[@]}"; do
      printf '  %s\n' "${case}"
    done
    printf '</testsuite>\n'
  } > "${junit_path}"
  return 0
}

if [[ -n "${PS_TEST_JUNIT_PATH:-}" ]]; then
  junit_enabled=1
  if [[ "${PS_TEST_JUNIT_PATH}" = /* ]]; then
    junit_path="${PS_TEST_JUNIT_PATH}"
  else
    junit_path="${repo_root}/${PS_TEST_JUNIT_PATH}"
  fi
elif [[ "${PS_TEST_JUNIT:-0}" == "1" ]]; then
  junit_enabled=1
  junit_path="${repo_root}/reports/junit.xml"
fi

on_error() {
  local last_rc
  last_rc=$?
  local rc="${1:-${last_rc}}"
  write_junit
  if [[ -n "${current_test_file}" ]]; then
    error "Test failed: $(basename "${current_test_file}") (exit ${rc})"
    detail_err "Path: ${current_test_file}"
  else
    error "Tests failed (exit ${rc})"
  fi
  exit "${rc}"
}
trap 'on_error $?' ERR

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

if [[ -n "${PS_TEST_SHARD:-}" ]]; then
  if [[ ! "${PS_TEST_SHARD}" =~ ^[0-9]+/[0-9]+$ ]]; then
    error "invalid PS_TEST_SHARD (expected N/M, got '${PS_TEST_SHARD}')"
    exit 1
  fi
  IFS=/ read -r shard_index shard_total <<< "${PS_TEST_SHARD}"
  if [[ "${shard_total}" -le 0 || "${shard_index}" -le 0 || "${shard_index}" -gt "${shard_total}" ]]; then
    error "invalid PS_TEST_SHARD (expected 1<=N<=M, got '${PS_TEST_SHARD}')"
    exit 1
  fi
  detail "Tests: sharding enabled (${shard_index}/${shard_total})"
  shard_files=()
  for idx in "${!test_files[@]}"; do
    if (( idx % shard_total == shard_index - 1 )); then
      shard_files+=("${test_files[$idx]}")
    fi
  done
  test_files=("${shard_files[@]}")
fi

if [[ "${#test_files[@]}" -eq 0 ]]; then
  if [[ "${CI}" != "0" ]]; then
    error "no tests assigned to shard (PS_TEST_SHARD=${PS_TEST_SHARD})"
    exit 1
  fi
  detail "Tests: no tests assigned to shard (bootstrap mode)."
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
  start_ts="$(date +%s)"
  if node "${f}"; then
    rc=0
  else
    rc=$?
  fi
  end_ts="$(date +%s)"
  duration=$(( end_ts - start_ts ))

  junit_tests=$((junit_tests + 1))
  junit_time=$((junit_time + duration))

  if [[ "${junit_enabled}" == "1" ]]; then
    case_name="$(xml_escape "$(basename "${f}")")"
    if [[ "${rc}" -eq 0 ]]; then
      junit_cases+=("<testcase name=\"${case_name}\" time=\"${duration}\"/>")
    else
      junit_failures=$((junit_failures + 1))
      failure_msg="$(xml_escape "exit ${rc}")"
      failure_body="$(xml_escape "Path: ${f}")"
      junit_cases+=("<testcase name=\"${case_name}\" time=\"${duration}\"><failure message=\"${failure_msg}\">${failure_body}</failure></testcase>")
    fi
  fi

  if [[ "${rc}" -ne 0 ]]; then
    on_error "${rc}"
  fi
done

current_test_file=""

write_junit

if [[ -x "${branding_script}" ]]; then
  bash "${branding_script}" "tests.result" "Tests passed" "${#test_files[@]} test file(s) validated"
else
  printf 'Tests passed: %s test file(s) validated\n' "${#test_files[@]}"
fi

# Explicitly return success when sourced to clarify intended behavior
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
else
  exit 0
fi
