# Branding Scripts

Output helpers for consistent Political Sphere CLI presentation.

## Contents

- `print-banner.sh`: prints the Political Sphere ASCII banner.
- `print-section.sh`: prints standardized section headers.
- `format.env`: shared formatting tokens (icon, separators, indentation).
- `format.sh`: shared formatting helpers for bash scripts.
  - Includes `ps_log` for structured `PS.LOG` records (see `docs/terminal-output-standard.md`).
  - Includes `ps_cli_header` for standardized CLI run headers.
- `validate-inputs.sh`: legacy input validation helpers (kept for compatibility).

Validation helpers now live in `tools/scripts/actions/cross-cutting/validate.sh`.

## Usage

- `bash tools/scripts/branding/print-banner.sh`
- `bash tools/scripts/branding/print-section.sh "<id>" "<title>" "[description]"`
