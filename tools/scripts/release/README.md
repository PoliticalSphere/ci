# Release Scripts

This directory contains release automation scripts used by CI.

## Scripts

- `release.sh` Create an annotated tag and GitHub Release.

## Inputs (Environment)

- `PS_RELEASE_VERSION` SemVer without leading `v` (required).
- `PS_GENERATE_NOTES` `true|false` (optional, default `true`).
- `PS_GIT_USER_NAME` Git user name (optional).
- `PS_GIT_USER_EMAIL` Git email (optional).
- `GH_TOKEN` GitHub token for release publishing (required).
