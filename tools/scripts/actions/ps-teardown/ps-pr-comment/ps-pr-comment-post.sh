#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — PS PR Comment Post
# ------------------------------------------------------------------------------
# Purpose:
#   Post a PR comment during teardown.
# ==============================================================================


# Write body to a file to preserve newlines and avoid quoting issues.
body_file="$(mktemp)"
printf '%s' "${PS_BODY}" > "${body_file}"

gh api \
  -X POST \
  "repos/${GITHUB_REPOSITORY}/issues/${PS_PR_NUMBER}/comments" \
  -F "body=@${body_file}"

rm -f "${body_file}"
echo "PS.PR_COMMENT: OK"
