# Lint Configs

This directory contains single-source-of-truth configuration for linting and
quality tools used by local gates and CI.

## Contents

- `biome.json`: Biome formatting and lint rules. (Stored at repo root due to Biome config requirements.)
- `eslint.config.mjs`: ESLint configuration.
- `tsconfig.base.json`: shared TypeScript baseline.
- `markdownlint.jsonc`: markdownlint rules (JSONC for comments).
- `yamllint.yml`: yamllint rules.
- `actionlint.yml`: actionlint configuration.
- `hadolint.yaml`: hadolint configuration.
- `shellcheckrc`: shellcheck configuration.
- `jscpd.json`: duplication detection configuration.
  - `.github/workflows/**` is excluded to avoid false positives from
    declarative workflow boilerplate.

## Usage

Scripts under `tools/scripts/lint/` consume these configs. Changes should be
made here (not in scripts) unless a tool requires CLI-only settings.
