# CI Scripts

Scripts that enforce CI policy and validation.

## Scripts

- `validate-ci/index.js`: CI workflow validation gate (entrypoint).
- `validate-ci-action.sh`: composite action wrapper for running the validate-ci gate.
- `validate-pr-refs.sh`: Validate PR base/head SHAs for dependency review.
- `totem-check.js`: Validate files against architectural totem patterns.

## Usage

```bash
# Validate-CI (workflow policy enforcement)
node tools/scripts/ci/validate-ci/index.js

# With remote SHA verification
PS_VALIDATE_CI_VERIFY_REMOTE=1 node tools/scripts/ci/validate-ci/index.js

# Totem compliance check
npm run totem-check
node tools/scripts/ci/totem-check.js
```

## Totem Checker

The totem compliance checker validates that files follow the documented
patterns from `docs/architectural-totems.md`:

- **Bash scripts**: shebang, strict-mode, header block
- **Workflows**: header block, metadata section, purpose section
- **JavaScript**: header block, purpose comment

Run: `npm run totem-check`

## Notes

These gates are designed to be the first step in workflows and must remain
non-interactive and deterministic.
