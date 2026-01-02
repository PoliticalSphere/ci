# Contributing

Thanks for contributing! This repository is maintained by a small, solo team.
Below are guidelines to keep changes secure, deterministic, and
high-quality.

Quick local setup

- Node.js: **22.x** (use nvm or Volta to install and pin the version)
- Install dev deps: `npm install`

Running checks locally

- Lint: `npm run lint` (or `npm run lint:affected` for PRs)
- Typecheck: `npm run typecheck`
- Tests: `npm run test` (or `npm run preflight` for full gates)
- Duplication: `npm run jscpd`

Validate-CI

- The platform enforces strict CI policies using
  `tools/scripts/ci/validate-ci/index.js` and
  `configs/ci/policies/*.yml`.
- To reproduce remote SHA verification failures locally, set
  `PS_VALIDATE_CI_VERIFY_REMOTE=1` and run:

  ```bash
  PS_VALIDATE_CI_VERIFY_REMOTE=1 node tools/scripts/ci/validate-ci/index.js
  ```

Policy & allowlists

- Adding or changing allowlist entries (e.g., action allowlist) requires a
  documented risk decision recorded in `docs/risk-decisions.md`.
- Follow the risk decision template when making changes.

Patch & PR process

- Keep changes small and focused (single responsibility per PR).
- Include tests (or update existing tests) when adding functionality or
  policy changes.
- Ensure `npm run preflight` is green before requesting review.

Reporting problems

- For security findings, see `SECURITY.md`.
- For general repository issues, open a regular issue and tag appropriately.

Thank you for helping maintain a secure, deterministic CI platform.
If you have questions, open an issue or reach out via the repo contact info.
