# Risk Decisions Log

This log records approved deviations from policy. It is intentionally
machine-discoverable and easy to parse.

## Template

Copy the block below for each decision:

```yaml
- id: RD-YYYY-### 
  date: YYYY-MM-DD
  owner: name-or-team
  status: approved | expired | revoked
  scope: file(s), workflow(s), or system(s)
  policy: reference to violated policy
  decision: brief summary
  rationale: why this was necessary
  impact: security/quality/runtime implications
  mitigation: compensating controls
  expires: YYYY-MM-DD
  approval: approver name or ticket
```

## Decisions

- id: RD-2025-001
  date: 2025-12-19
  owner: political-sphere
  status: approved
  scope: .github/workflows/security-scheduled.yml, .github/workflows/release.yml
  policy: configs/ci/policies/unsafe-patterns.yml#UP-011
  decision: Allow fetch-depth: 0 for full history where required
  rationale: Full history is required for gitleaks history scanning and for release tagging context.
  impact: Increased runtime and wider git history exposure during the job.
  mitigation: Read-only permissions, hardened runner, isolated job, no secrets in logs.
  expires: 2026-12-19
  approval: platform-governance

- id: RD-2025-002
  date: 2025-12-19
  owner: political-sphere
  status: approved
  scope: configs/ci/policies/allowed-actions.yml, .github/workflows/security-scheduled.yml
  policy: configs/ci/policies/validate-ci.yml#sha_pinning
  decision: Allow trufflesecurity/trufflehog for scheduled secrets scanning
  rationale: Add complementary secrets coverage on scheduled scans without blocking PRs.
  impact: Additional runtime and potential duplicate findings in scheduled scans.
  mitigation: Scheduled-only use, hardened runner, artifact-only output, no PR gating.
  expires: 2026-12-19
  approval: platform-governance

- id: RD-2025-003
  date: 2025-12-21
  owner: political-sphere
  status: approved
  scope: configs/security/license-policy.yml
  policy: configs/security/license-policy.yml#allowlist
  decision: Allow `Python-2.0` SPDX license identifier in license allowlist
  rationale: `argparse@2.0.1` is transitively required; Python-2.0 is a permissive license
    acceptable for the platform
  impact: Small increase in accepted dependency licenses; low security risk
  mitigation: Review and monitor packages using this license; time-bounded review scheduled
  expires: 2026-06-21
  approval: platform-governance

- id: RD-2025-004
  date: 2025-12-23
  owner: political-sphere
  status: approved
  scope: configs/ci/policies/allowed-actions.yml, .github/workflows/pr-gates.yml
  policy: configs/ci/policies/validate-ci.yml#sha_pinning
  decision: Allow `sonarsource/sonarcloud-github-action` in the action allowlist for baseline SonarCloud analysis
  rationale: SonarCloud provides baseline analysis for code quality and security. The job is non-blocking by default (continue-on-error) and runs in a hardened runner with minimal permissions; its output is stored as artifacts only.
  impact: Introduces external action dependency; risk is mitigated by pinning to a specific commit SHA, using hardened runner, keeping the job non-blocking, and controlling token usage via repository secrets.
  mitigation: Pin the action to specific SHA; run in hardened runner; store findings to artifacts only; do not automatically post blocking checks.
  expires: 2026-06-23
  approval: platform-governance
