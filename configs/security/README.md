# Security Configs

This directory contains security scanner configuration files used by local
and CI security gates.

## Contents

- `gitleaks.toml`: gitleaks rules and allowlists for secret detection.
- `license-policy.yml`: allowlist/denylist policy for OSS license compliance.
- `trivy.yaml`: Trivy filesystem scan policy (severity, scanners, skips).
- `tooling.env`: pinned security tool versions and SHA256 checksums.

## Usage

Security scripts under `tools/scripts/security/` reference these configs.
Any allowlist or rule changes must be tracked in `docs/risk-decisions.md`.
Tool versions in `tooling.env` must remain SHA‑pinned to preserve supply-chain integrity.
