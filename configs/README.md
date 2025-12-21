# Configs

This directory is the single source of truth for CI policy, linting rules,
and tool configuration. Consumers should reference these files directly or
copy them with minimal, well-documented changes.

Note: Biome requires a root config file, so `biome.json` lives at repo root.

## Structure

- `/configs/ci` CI policy, allowlists, and validation rules.
  - `/configs/ci/policies` enforcement policies and baselines
  - `/configs/ci/exceptions` allowlists and approved exceptions
- `/configs/lint` Linting, formatting, and analysis tool configs.
- `/configs/consumer` Consumer repository contract policies.

## Usage

- Prefer referencing these files from workflows and scripts.
- If customization is required, document the delta and rationale.
