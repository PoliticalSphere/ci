# Branding

Political Sphere CI output must be consistent, recognisable, and professional.
This directory defines the branding assets and usage rules.

## Assets

- `branding/ps-banner.txt` Political Sphere ASCII banner.
- `tools/scripts/branding/format.env` Output formatting tokens for CLI sections.
- `tools/scripts/branding/format.sh` Formatting helpers for bash scripts.
- `tools/scripts/core/validation.sh` Shared validation helpers.
- `tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh` Bootstrap action validation helpers.

## Usage Rules

- The banner is displayed in local hooks and major CI steps.
- Use the banner exactly as provided; do not modify without approval.
- Output is sectioned and deterministic to aid AI parsing.

## Where It’s Used

- `tools/scripts/branding/format.sh` (source once, then call `ps_print_banner`/`ps_print_section`)
- `tools/scripts/gates/pre-commit.sh`
- `tools/scripts/gates/pre-push.sh`

## Output Style

- Clear, short section headers.
- No unstructured noise or unnecessary verbosity.
- Failures are explicit with remediation guidance.
