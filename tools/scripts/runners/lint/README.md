# Lint Scripts

Deterministic lint scripts used by local gates and CI.

## Scripts

- `biome.sh`
- `eslint.sh`
- `yamllint.sh`
- `actionlint.sh`
- `affected.sh`
- `hadolint.sh`
- `shellcheck.sh`
- `markdownlint.sh`

## Notes

These scripts consume configs from `configs/lint/` and should remain thin
wrappers without embedded policy.

Structured records are emitted via `PS.LOG` for machine parsing. See
`docs/terminal-output-standard.md`.
