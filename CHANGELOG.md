# Changelog

All notable changes to this CI/CD platform are documented in this file.

The format is based on "Keep a Changelog" and follows Semantic Versioning.
Detailed versioning rules live in `docs/versioning.md`.

## [Unreleased]

### Added

- Initial repository bootstrap and governance scaffolding.
- Add `ps-task` composite action to centralize preflight and ps-run
  execution, with optional path checks.
- Add `tools/scripts/actions` for composite-action helper scripts
  (validation + orchestration).
- Add `ps-harden-runner` and `ps-checkout` composite actions to
  standardize runner hardening and repository checkout.
- Add `ps-bootstrap` capability map README with traceability IDs.

### Changed

- Consolidate tool installers: introduce `ps-tools` as the canonical tool installer.
  Inputs include `bundle` = lint|security|none, `extra_tools` (multiline), or an
  explicit `tools` list.
- Remove now-redundant wrappers `ps-lint-tools` and `ps-security-tools` and
  update callers to use `ps-tools` (bundle=lint|security).
- `tools/scripts/ci/install-tools.sh` remains the low-level installer for
  pinned installs.
- Update lint/test/typecheck/jscpd/build/consumer-contract/license-check
  actions to use `ps-task` and reduce duplicated validation/run steps.
- Move composite action logic into scripts under `tools/scripts/actions` and
  `tools/scripts/security`, keeping action YAML minimal and reusable.
- Update `ps-tools` to install via `tools/scripts/ci/install-tools.sh` instead of
  a dedicated composite action.
- Update `ps-bootstrap` to honor `skip_checkout`, add explicit opt-out gating for
  `skip_harden`, and emit skip-state logs for observability.

### Deprecated

- None.

### Removed

- Remove legacy composite actions `ps-preflight` and `validate-paths` (logic now lives in
  scripts and `ps-task`).
- Remove legacy CI completion scripts `tools/scripts/ci/build-complete.sh` and
  `tools/scripts/ci/validate-ci-complete.sh` and drop their workflow steps.

### Fixed

- None.

### Security

- None.
