<!--
# ==============================================================================
# Political Sphere — Local Development Guide
# ------------------------------------------------------------------------------
# Purpose:
#   Comprehensive onboarding guide for local development setup, tooling, and
#   workflow integration with the CI/CD platform.
#
# Dependencies:
#   - docs/integration-guide.md (consumer perspective)
#   - docs/ci-policy.md (policy requirements)
#
# Dependents:
#   - New contributors and platform developers
# ==============================================================================
-->

# Local Development Guide

This guide covers setting up a local development environment for the Political
Sphere CI/CD platform and ensuring your workflow mirrors CI behavior.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥22.0.0 | Required for all tooling |
| npm | ≥10.9.0 | Package manager |
| Bash | ≥4.0 | Shell scripts require modern bash |
| Git | ≥2.30 | Version control |

### Optional but Recommended

| Tool | Purpose |
|------|---------|
| [actionlint](https://github.com/rhysd/actionlint) | GitHub Actions workflow linting |
| [shellcheck](https://www.shellcheck.net/) | Shell script static analysis |
| [yamllint](https://github.com/adrienverge/yamllint) | YAML linting |
| [hadolint](https://github.com/hadolint/hadolint) | Dockerfile linting |
| [lefthook](https://github.com/evilmartians/lefthook) | Git hooks manager |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/PoliticalSphere/ci.git
cd ci

# Install dependencies
npm ci

# Install git hooks (recommended)
lefthook install

# Run the preflight check
npm run preflight
```

---

## Available Scripts

### Primary Commands

| Command | Description |
|---------|-------------|
| `npm run lint` | Run formatted lint (Biome, ESLint, ShellCheck) |
| `npm run lint:all` | Run all linters comprehensively |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run typecheck` | TypeScript strict type checking |
| `npm run test` | Run unit tests |
| `npm run preflight` | Full pre-push validation (lint + typecheck + test + jscpd) |

### CI Policy Commands

| Command | Description |
|---------|-------------|
| `npm run validate-ci` | Validate CI policy compliance |
| `npm run evasion-scan` | Scan for policy evasion patterns |
| `npm run totem-check` | Verify file headers match totem patterns |
| `npm run consumer-contract` | Validate consumer contract compliance |
| `npm run license-check` | Check dependency license compliance |

### Specific Linters

| Command | Description |
|---------|-------------|
| `npm run lint:biome` | Biome formatting and linting |
| `npm run lint:eslint` | ESLint static analysis |
| `npm run lint:yaml` | YAML syntax and style |
| `npm run lint:actionlint` | GitHub Actions workflow validation |
| `npm run lint:shellcheck` | Shell script analysis |
| `npm run lint:markdown` | Markdown style checking |
| `npm run lint:cspell` | Spell checking |
| `npm run lint:knip` | Unused exports detection |
| `npm run jscpd` | Copy-paste detection |

### Affected-Only Variants

For faster iteration, use `:affected` variants to lint only changed files:

```bash
npm run lint:affected           # Formatted lint on changed files
npm run lint:biome:affected     # Biome on changed files
npm run lint:eslint:affected    # ESLint on changed files
```

---

## Git Hooks (Lefthook)

The repository uses Lefthook for git hooks. After `lefthook install`:

### Pre-Commit Hook

Runs fast checks before each commit:

- Biome formatting
- ESLint
- ShellCheck
- Markdown lint
- Spell check

### Pre-Push Hook

Runs comprehensive validation before push:

- Full linting suite
- TypeScript type checking
- Unit tests
- Duplication detection

### Bypassing Hooks (Emergency Only)

```bash
git commit --no-verify -m "message"  # Skip pre-commit
git push --no-verify                  # Skip pre-push
```

> ⚠️ **Warning**: Bypassing hooks will cause CI failures. Use only for emergencies
> and document the rationale.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CI` | `false` | Set to `1` in CI environments |
| `PS_LINT_PRINT_MODE` | `final` | Output mode: `inline` or `final` |
| `PS_PLATFORM_ROOT` | (auto) | Root path to platform repository |
| `NO_COLOR` | (unset) | Disable colored output when set |

---

## Directory Structure

```
.
├── .github/
│   ├── actions/           # Composite actions (ps-bootstrap, ps-task, etc.)
│   └── workflows/         # Reusable and caller workflows
├── configs/
│   ├── ci/policies/       # CI policy files and baselines
│   ├── lint/              # Linter configurations
│   ├── consumer/          # Consumer contract policies
│   └── security/          # Security scanning configs
├── docs/                  # Documentation
├── tools/
│   ├── scripts/           # Operational scripts
│   └── tests/             # Self-tests
└── examples/              # Example consumer workflows
```

---

## Workflow for Contributors

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-change
```

### 2. Make Changes

Edit files as needed. The pre-commit hook will validate on commit.

### 3. Verify Locally

```bash
# Quick check
npm run lint

# Full validation (matches CI)
npm run preflight

# CI policy validation
npm run validate-ci
npm run evasion-scan
npm run totem-check
```

### 4. Commit and Push

```bash
git add .
git commit -m "feat: descriptive message"
git push origin feature/my-change
```

### 5. Open Pull Request

CI will run the full validation suite. Address any failures before requesting review.

---

## Troubleshooting

### "Command not found" errors

Ensure optional tools are installed:

```bash
# macOS
brew install actionlint shellcheck yamllint hadolint lefthook

# Or use npm for some tools
npm install -g cspell markdownlint-cli2
```

### Type errors after pulling changes

```bash
npm ci                    # Reinstall dependencies
npm run typecheck         # Re-run type check
```

### Lint errors on unchanged files

The linters use cached configurations. Clear caches if needed:

```bash
rm -rf node_modules/.cache
npm run lint:all
```

### CI passes but local fails (or vice versa)

Ensure your local Node.js version matches CI:

```bash
node --version  # Should be ≥22.0.0
npm --version   # Should be ≥10.9.0
```

---

## Related Documentation

- [Integration Guide](integration-guide.md) — Consumer repository setup
- [CI Policy](ci-policy.md) — Policy requirements and rationale
- [Testing Strategy](testing-strategy.md) — Test structure and coverage
- [Composite Actions Guide](composite-actions-guide.md) — Action catalog and usage

