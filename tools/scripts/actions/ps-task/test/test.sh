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
# shellcheck source=tools/scripts/core/base-helpers.sh
. "${script_dir}/../../../core/base-helpers.sh"
init_repo_context

# shellcheck source=tools/scripts/core/time-helpers.sh
. "${repo_root}/tools/scripts/core/time-helpers.sh"

cd "${repo_root}"

CI="${CI:-0}"
format_sh="${repo_root}/tools/scripts/branding/format.sh"
if [[ -f "${format_sh}" ]]; then
  # shellcheck source=tools/scripts/branding/format.sh
  . "${format_sh}"
fi
tests_dir="${repo_root}/tools/tests"

PS_LOG_COMPONENT="tests"
export PS_LOG_COMPONENT
TEST_LOG_STARTED=0
TEST_LOG_START_MS=""
TEST_LOG_STATUS_OVERRIDE=""
TEST_LOG_TOTAL=0
TEST_LOG_SHARD="${PS_TEST_SHARD:-}"
if command -v ps_epoch_ms >/dev/null 2>&1; then
  TEST_LOG_START_MS="$(ps_epoch_ms)"
fi

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

test_log_start() {
  [[ "${TEST_LOG_STARTED}" -eq 1 ]] && return 0
  TEST_LOG_STARTED=1
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info test.suite.start \
      "count=${TEST_LOG_TOTAL}" \
      ${TEST_LOG_SHARD:+"shard=${TEST_LOG_SHARD}"} \
      "junit=${junit_enabled}"
  fi
  return 0
}

test_log_finish() {
  local rc="${1:-0}"
  local status=""
  local end_ms=""
  local duration_ms=""

  if [[ -n "${TEST_LOG_STATUS_OVERRIDE}" ]]; then
    status="${TEST_LOG_STATUS_OVERRIDE}"
  elif [[ "${rc}" -eq 0 ]]; then
    status="PASS"
  else
    status="FAIL"
  fi

  if command -v ps_epoch_ms >/dev/null 2>&1; then
    end_ms="$(ps_epoch_ms)"
  fi
  if [[ -n "${TEST_LOG_START_MS}" && -n "${end_ms}" ]]; then
    duration_ms=$((end_ms - TEST_LOG_START_MS))
  fi

  if command -v ps_log >/dev/null 2>&1; then
    ps_log info test.suite.finish \
      "status=${status}" \
      "exit_code=${rc}" \
      "count=${junit_tests}" \
      "failures=${junit_failures}" \
      ${duration_ms:+"duration_ms=${duration_ms}"}
  fi
  return 0
}
trap 'test_log_finish $?' EXIT

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
  return "${rc}"
}
trap 'on_error $?' ERR

if [[ ! -d "${tests_dir}" ]]; then
  TEST_LOG_TOTAL=0
  test_log_start
  if [[ "${CI}" != "0" ]]; then
    TEST_LOG_STATUS_OVERRIDE="ERROR"
    error "tools/tests not found (CI requires tests)."
    exit 1
  fi
  TEST_LOG_STATUS_OVERRIDE="SKIPPED"
  detail "Tests: tools/tests not found (bootstrap mode)."
  detail "HINT: add deterministic tests under tools/tests/."
  exit 0
fi

if [[ ! -f "${repo_root}/package.json" ]]; then
  TEST_LOG_TOTAL=0
  test_log_start
  TEST_LOG_STATUS_OVERRIDE="ERROR"
  error "package.json not found; cannot run tests."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  TEST_LOG_TOTAL=0
  test_log_start
  TEST_LOG_STATUS_OVERRIDE="ERROR"
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
  TEST_LOG_TOTAL=0
  test_log_start
  if [[ "${CI}" != "0" ]]; then
    TEST_LOG_STATUS_OVERRIDE="ERROR"
    error "test harness missing under tools/tests (CI requires tests)."
    exit 1
  fi
  TEST_LOG_STATUS_OVERRIDE="SKIPPED"
  detail "Tests: test harness not found (bootstrap mode)."
  detail "HINT: add deterministic tests under tools/tests/."
  exit 0
fi

if [[ -n "${PS_TEST_SHARD:-}" ]]; then
  if [[ ! "${PS_TEST_SHARD}" =~ ^[0-9]+/[0-9]+$ ]]; then
    TEST_LOG_TOTAL=0
    test_log_start
    TEST_LOG_STATUS_OVERRIDE="ERROR"
    error "invalid PS_TEST_SHARD (expected N/M, got '${PS_TEST_SHARD}')"
    exit 1
  fi
  IFS=/ read -r shard_index shard_total <<< "${PS_TEST_SHARD}"
  if [[ "${shard_total}" -le 0 || "${shard_index}" -le 0 || "${shard_index}" -gt "${shard_total}" ]]; then
    TEST_LOG_TOTAL=0
    test_log_start
    TEST_LOG_STATUS_OVERRIDE="ERROR"
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
  TEST_LOG_TOTAL=0
  test_log_start
  if [[ "${CI}" != "0" ]]; then
    TEST_LOG_STATUS_OVERRIDE="ERROR"
    error "no tests assigned to shard (PS_TEST_SHARD=${PS_TEST_SHARD})"
    exit 1
  fi
  TEST_LOG_STATUS_OVERRIDE="SKIPPED"
  detail "Tests: no tests assigned to shard (bootstrap mode)."
  exit 0
fi

TEST_LOG_TOTAL="${#test_files[@]}"
test_log_start

if command -v ps_print_section >/dev/null 2>&1; then
  ps_print_section "tests" "Running tests" "tools/tests"
else
  echo "Running tests: tools/tests"
fi

for f in "${test_files[@]}"; do
  current_test_file="${f}"
  if command -v ps_print_section >/dev/null 2>&1; then
    ps_print_section "test" "Running test" "$(basename "${f}")"
  else
    printf 'Running test: %s\n' "$(basename "${f}")"
  fi
  case_start_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    case_start_ms="$(ps_epoch_ms)"
  fi
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info test.case.start \
      "id=$(basename "${f}")" \
      "path=${f}"
  fi
  start_ts="$(epoch_now)"
  if node "${f}"; then
    rc=0
  else
    rc=$?
  fi
  end_ts="$(epoch_now)"
  duration=$(( end_ts - start_ts ))
  case_end_ms=""
  case_duration_ms=""
  if command -v ps_epoch_ms >/dev/null 2>&1; then
    case_end_ms="$(ps_epoch_ms)"
  fi
  if [[ -n "${case_start_ms}" && -n "${case_end_ms}" ]]; then
    case_duration_ms=$((case_end_ms - case_start_ms))
  fi
  if command -v ps_log >/dev/null 2>&1; then
    ps_log info test.case.finish \
      "id=$(basename "${f}")" \
      "path=${f}" \
      "status=$([[ "${rc}" -eq 0 ]] && printf '%s' PASS || printf '%s' FAIL)" \
      "exit_code=${rc}" \
      ${case_duration_ms:+"duration_ms=${case_duration_ms}"}
  fi

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
    TEST_LOG_STATUS_OVERRIDE="FAIL"
    on_error "${rc}"
  fi
done

current_test_file=""

write_junit

if command -v ps_print_section >/dev/null 2>&1; then
  ps_print_section "tests.result" "Tests passed" "${#test_files[@]} test file(s) validated"
else
  printf 'Tests passed: %s test file(s) validated\n' "${#test_files[@]}"
fi

# Explicitly return success when sourced to clarify intended behavior
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
else
  exit 0
fi
