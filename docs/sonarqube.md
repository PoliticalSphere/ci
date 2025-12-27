# SonarCloud integration (baseline)

This repository is configured to run a non-blocking SonarCloud analysis as part of the PR Gates workflow.

## Purpose

- Collect a baseline of Sonar issues (bugs, vulnerabilities, code smells,
  duplication) so the team can tune quality rules and suppress false positives
  before enabling a blocking Quality Gate.

## How it works

- The job `sonar` is added to `.github/workflows/pr-gates.yml` and runs after
  `test` and `typecheck` succeed.
- The job is *non-blocking* by default (`continue-on-error: true`) and only runs
  when the required secrets are present.

## Required secrets (set in repository settings)

- `SONAR_TOKEN` — token with permissions to upload analysis to your SonarCloud
  organization or SonarQube server.
- `SONAR_ORGANIZATION` — SonarCloud organization key (for SonarCloud).
- `SONAR_PROJECT_KEY` — Sonar project key in the target organization.

If these secrets are not set the Sonar job will be skipped.

## Next steps

1. Configure a SonarCloud project (or self-hosted SonarQube project).
2. Set the secrets listed above in repository Settings → Secrets.
3. Re-run the PR gates or open a PR to run a baseline scan and review issues.

Once you are satisfied with the baseline and rule tuning,
we can enable a blocking Quality Gate to fail PRs when thresholds are exceeded.
