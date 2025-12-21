# AI Governance Model

This repository is designed for AI-augmented engineering under strict
human-in-the-loop control. The AI is a productivity tool, not an authority.

## Principles

- Human approval is required for all risk-bearing changes.
- Policies live in configs, not hidden in scripts.
- All automation is deterministic and non-interactive.
- Outputs are structured and easy to audit.

## Decision Control

- **Risk decisions** are logged in `docs/risk-decisions.md`.
- **Policy changes** require explicit review and documented rationale.
- **Exceptions** are time-bound and must include an owner and expiry date.

## AI Operating Constraints

- Prefer composite actions and reusable workflows over duplicated logic.
- Avoid clever logic; use linear, explicit scripts.
- Document non-obvious decisions inline with intent-focused comments.
- Do not introduce tools without a defined consumer.

## Auditability

- Each workflow produces artifacts for validation and security steps.
- CI output is sectioned and consistent across local and CI runs.
- All configuration files are the source of truth for thresholds.

## Human Review Requirements

- Any change to security, permissions, or validation must be reviewed.
- Any relaxation of controls must include a risk decision entry.
