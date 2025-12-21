# Security CI Policy

This policy defines mandatory security scanning for the CI/CD platform and
consuming repositories. Scans are scheduled to balance fast PR feedback with
deep historical and dependency analysis.

## Goals

- Detect secrets, vulnerabilities, and insecure configurations early.
- Provide repeatable, auditable security signals.
- Use free, open-source, or GitHub-native tools only.

## Required Security Scans

- **Secrets**
  - Fast PR scan on every pull request.
  - Scheduled deep scan for full history.
  - Scheduled TruffleHog deep scan for additional coverage.
- **SAST**
  - CodeQL where applicable.
  - Semgrep Community Edition for additional coverage.
- **Dependencies**
  - GitHub Dependency Review on pull requests.
  - `npm audit` tuned for signal-to-noise.
- **License Compliance**
  - Dependency license checks against the platform allowlist/denylist policy.
- **Supply Chain**
  - OpenSSF Scorecard on a scheduled cadence.
- **IaC/Containers (if applicable)**
  - Trivy scans for config, IaC, and container images.

## SARIF and Artifacts

Where supported, tools must upload SARIF results and raw artifacts.
Artifacts are retained for a defined retention period in workflows.

Secrets scans generate redacted SARIF reports stored under `reports/security/`
and uploaded as artifacts only (not code scanning alerts).
CodeQL and Semgrep SARIF are uploaded to code scanning and retained as
artifacts for local/AI review.
License compliance emits `reports/security/license-report.json` and a text
summary under `reports/security/`, plus logs under `logs/security/`.

## Scheduling and Cadence

- PR: fast scans for secrets, lint, and dependency review.
- Scheduled: full scans for history, SAST depth, and supply-chain posture.

## Exceptions and Risk Decisions

Any deviation from this policy must be documented in:

- `docs/risk-decisions.md`
- The relevant allowlist in `/configs/ci`

Exceptions must include rationale, scope, approval, and review date.
