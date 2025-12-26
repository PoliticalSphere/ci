#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${PS_PLATFORM_ROOT:-}" && -f "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" ]]; then
  bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" \
    "job-setup.summary" "node_version=${PS_NODE_VERSION} fetch_depth=${PS_FETCH_DEPTH} ref=${PS_REF_INPUT:-<default>} cache=${PS_CACHE} install_dependencies=${PS_INSTALL_DEPS} install_tools=${PS_INSTALL_TOOLS} tools_bundle=${PS_TOOLS_BUNDLE} working_directory=${PS_WORKING_DIR} skip_harden=${PS_SKIP_HARDEN:-0} skip_checkout=${PS_SKIP_CHECKOUT:-0} skip_platform_checkout=${PS_SKIP_PLATFORM_CHECKOUT:-false} allow_unsafe=${PS_ALLOW_UNSAFE:-0} unsafe_reason=${PS_UNSAFE_REASON:-<none>}"
else
  printf 'PS.JOB_SETUP: node_version=%s fetch_depth=%s ref=%s cache=%s install_dependencies=%s install_tools=%s tools_bundle=%s working_directory=%s skip_harden=%s skip_checkout=%s skip_platform_checkout=%s allow_unsafe=%s unsafe_reason=%s\n' "${PS_NODE_VERSION}" "${PS_FETCH_DEPTH}" "${PS_REF_INPUT:-<default>}" "${PS_CACHE}" "${PS_INSTALL_DEPS}" "${PS_INSTALL_TOOLS}" "${PS_TOOLS_BUNDLE}" "${PS_WORKING_DIR}" "${PS_SKIP_HARDEN:-0}" "${PS_SKIP_CHECKOUT:-0}" "${PS_SKIP_PLATFORM_CHECKOUT:-false}" "${PS_ALLOW_UNSAFE:-0}" "${PS_UNSAFE_REASON:-<none>}"
fi
