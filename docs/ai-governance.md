# AI Governance Model

> Part of the [Vision](./VISION.md) — Preventing "Self-Governance Bias" in AI-driven development.

This repository is designed for AI-augmented engineering under strict
human-in-the-loop control. The AI is a productivity tool, not an authority.

## The Security Sandbox

This repository implements **Structural Isolation** as defined in the Vision:

- **Externalized Governance**: CI/CD logic is physically separated from the game's source code.
- **Immutable Gates**: AI agents working on the simulation cannot bypass or modify the safety checks.
- **Self-Governance Bias Prevention**: The AI cannot "greenlight" its own buggy code.

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

These constraints implement the Vision's **SOLID**, **DRY**, and **KISS** principles:

- Prefer composite actions and reusable workflows over duplicated logic (DRY).
- Avoid clever logic; use linear, explicit scripts (KISS).
- Document non-obvious decisions inline with intent-focused comments (Cognitive Ergonomics).
- Do not introduce tools without a defined consumer (YAGNI).
- Extract complex logic into standalone, modular scripts (SRP).

## Auditability

- Each workflow produces artifacts for validation and security steps.
- CI output is sectioned and consistent across local and CI runs.
- All configuration files are the source of truth for thresholds.

## Human Review Requirements

- Any change to security, permissions, or validation must be reviewed.
- Any relaxation of controls must include a risk decision entry.

## Related Documentation

- [Vision](./VISION.md) — Architectural philosophy
- [Risk Decisions](./risk-decisions.md) — Change control log
- [CI Policy Governance](./ci-policy-governance.md) — Policy enforcement
