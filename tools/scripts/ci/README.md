# CI Scripts

Scripts that enforce CI policy and validation.

## Scripts

- `validate-ci/index.js`: CI workflow validation gate (entrypoint).
- `validate-pr-refs.sh`: Validate PR base/head SHAs for dependency review.

## Usage

- `node tools/scripts/ci/validate-ci/index.js`
- `PS_VALIDATE_CI_VERIFY_REMOTE=1 node tools/scripts/ci/validate-ci/index.js`
- `PS_PR_NUMBER=123 PS_EXPECTED_BASE_SHA=<sha> PS_EXPECTED_HEAD_SHA=<sha> bash tools/scripts/ci/validate-pr-refs.sh`

## Notes

This gate is the first step in all reusable workflows and must remain
non-interactive and deterministic.
