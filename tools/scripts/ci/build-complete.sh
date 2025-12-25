#!/usr/bin/env bash
set -euo pipefail

# Emit a machine-friendly completion message for build-artifacts
BRAND_KEY="${PS_BRAND_KEY:-build.artifacts}"
WORKFLOW_ID="${PS_WORKFLOW_ID:-build-artifacts}"
BUILD_OUTCOME="${BUILD_OUTCOME:-unknown}"
UPLOAD_OUTCOME="${UPLOAD_OUTCOME:-unknown}"
SUCCESS="success"

if [[ -n "${PS_PLATFORM_ROOT:-}" && -f "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" ]]; then
  bash "${PS_PLATFORM_ROOT}/tools/scripts/branding/print-section.sh" "${BRAND_KEY}" "Build artifacts complete" 2>/dev/null || true
fi

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "PS.${WORKFLOW_ID}: completed_at=${ts} build=${BUILD_OUTCOME} upload=${UPLOAD_OUTCOME}"

if [[ "${BUILD_OUTCOME}" != "${SUCCESS}" ]]; then
  echo "ERROR: Build step failed (outcome=${BUILD_OUTCOME})." >&2
  echo "Tip: review the build step logs and the build script path provided to the workflow."
fi

if [[ "${UPLOAD_OUTCOME}" != "${SUCCESS}" ]]; then
  echo "WARN: Artifact upload did not succeed (outcome=${UPLOAD_OUTCOME})."
  echo "Tip: confirm artifact paths and presence."
fi

if [[ "${BUILD_OUTCOME}" == "${SUCCESS}" && "${UPLOAD_OUTCOME}" == "${SUCCESS}" ]]; then
  echo "PS.${WORKFLOW_ID}: OK"
else
  echo "PS.${WORKFLOW_ID}: FAILED (build=${BUILD_OUTCOME} upload=${UPLOAD_OUTCOME})"
fi
