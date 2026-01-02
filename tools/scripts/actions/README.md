# Action Scripts

Helper scripts used by composite actions to keep action logic minimal and
consistent while preserving deterministic, non-interactive execution.

## Purpose

- Move heavy logic out of composite action YAML and into versioned scripts.
- Keep workflows declarative and composite actions high-level.
- Centralize validation, logging, and safety checks.

## Notes

- These scripts are invoked by composite actions via `bash`.
- Inputs are passed via environment variables set in the action step.
- Scripts must be deterministic, non-interactive, and fail fast.
