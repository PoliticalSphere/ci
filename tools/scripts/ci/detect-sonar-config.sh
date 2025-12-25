#!/usr/bin/env bash
set -euo pipefail

# Determine whether SonarCloud scan should run and emit to GITHUB_OUTPUT
enabled="false"
if [[ -n "${SONAR_TOKEN:-}" && -n "${SONAR_ORGANIZATION:-}" && -n "${SONAR_PROJECT_KEY:-}" ]]; then
  enabled="true"
fi
echo "enabled=${enabled}" >> "$GITHUB_OUTPUT"
echo "PS.SONAR: enabled=${enabled}"
