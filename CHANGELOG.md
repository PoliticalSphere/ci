# Changelog

All notable changes to this CI/CD platform are documented in this file.

The format is based on "Keep a Changelog" and follows Semantic Versioning.
Detailed versioning rules live in `docs/versioning.md`.

## [Unreleased]

### Added

- Initial repository bootstrap and governance scaffolding.

### Changed

- Consolidate tool installers: introduce `ps-tools` as the canonical tool installer (inputs: `bundle` = lint|security|none, `extra_tools` multiline, or an explicit `tools` list). Remove now-redundant wrappers `ps-lint-tools` and `ps-security-tools` and update callers to use `ps-tools` (bundle=lint|security). `ps-install-tools` remains as the low-level installer for pinned installs (deprecated as the public entrypoint).

### Deprecated

- `ps-install-tools` is deprecated as the public entrypoint for tool installation; use `ps-tools` (added) as the canonical installer and update callers accordingly.

### Removed

- None.

### Fixed

- None.

### Security

- None.
