# Testing Strategy

This repository must test itself. The goal is to ensure all reusable
workflows, composite actions, scripts, and configurations are valid,
deterministic, and CI-compatible.

## Principles

- Tests are deterministic and non-interactive.
- Local gates mirror CI behavior as closely as possible.
- Failures are explicit, structured, and actionable.

## What Is Tested

- **Workflows**: validated with `actionlint`.
- **Composite actions**: unit-like tests for inputs/outputs and expected steps.
- **Scripts**: linted and shellchecked; smoke tests for exit codes.
- **Configs**: validated by the tools that consume them.
- **Consumer contracts**: contract policy checks against synthetic fixtures.

## Local vs CI Parity

- Lefthook pre-commit runs fast validation and lint checks.
- Lefthook pre-push runs typing, tests, build, and duplication checks.
- CI runs the same steps using composite actions and reusable workflows.

## Artifacts and Reporting

- Each major check uploads logs and outputs as artifacts.
- Where supported, results are emitted as SARIF.

## Flake Prevention

- No network calls in tests unless explicitly allowed and documented.
- Fixed versions and deterministic inputs for all test runners.
