# Branding Scripts

Output helpers for consistent Political Sphere CLI presentation.

## Contents

- `format.env`: shared formatting tokens (icon, separators, indentation).
- `format.sh`: shared formatting helpers for bash scripts.
  - Includes `ps_log` for structured `PS.LOG` records (see `docs/terminal-output-standard.md`).
  - Includes `ps_cli_header` for standardized CLI run headers.
- `validate-inputs.sh`: legacy input validation helpers (kept for compatibility).

Validation helpers now live in `tools/scripts/lib/validation.sh`.

## Usage

- Source the helpers: `. tools/scripts/branding/format.sh`
- Call `ps_print_banner` and `ps_print_section "<id>" "<title>" "[description]"`
