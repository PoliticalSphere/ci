# Political Sphere — Parallel Linter CLI

> High-speed orchestration layer for executing security and code linters in parallel with deterministic logging and auditable outcomes.

[![Node.js](https://img.shields.io/badge/Node.js-22.21.1+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Ink](https://img.shields.io/badge/Ink-Terminal_UI-000000)](https://github.com/vadimdemedes/ink)

---

## Overview

The **Political Sphere Parallel Linter CLI** is a purpose-built orchestration tool that executes multiple code quality and security linters concurrently with a beautiful, real-time terminal dashboard. It's designed for CI/CD environments where speed, determinism, and auditability are critical.

### Key Features

- ⚡️ **Parallel Execution** — Runs linters concurrently, utilizing N-1 CPU cores
- 📊 **Real-Time Dashboard** — Beautiful Ink-based terminal UI with live status updates
- 🔒 **Deterministic Logging** — Byte-for-byte reproducible logs with optional verification mode
- 🎨 **Pipe-Friendly** — Renders full dashboard even when piped through `head`, `tail`, or other tools
- 🚦 **Exit Code Semantics** — Fail-fast with clear success/failure signals for CI integration
- 🔍 **Comprehensive Coverage** — Security scanning, type checking, linting, duplicate detection, and more
- 📝 **Auditable Outcomes** — All linter output captured to individual log files

---

## Installation

```bash
npm install
```

The CLI is available as the `ps-lint` command via the package.json bin configuration.

---

## Quick Start

### Run all linters

```bash
npm run lint
```

### Run specific linters

```bash
npm run lint -- --linters eslint,typescript
```

### View help

```bash
npm run lint -- --help
```

---

## Usage

### Command Syntax

```bash
ps-lint [OPTIONS]
```

### Options

| Option             | Description                                       | Default      |
| :----------------- | :------------------------------------------------ | :----------- |
| `--help`           | Show help message                                 | -            |
| `--verify-logs`    | Enable byte-for-byte logging (verification mode)  | `false`      |
| `--log-dir <path>` | Directory for log files                           | `./logs`     |
| `--linters <list>` | Comma- or space-separated list of linters to run  | All linters  |

### Available Linters

| Linter            | Purpose                          | Category       |
| :---------------- | :------------------------------- | :------------- |
| **gitleaks**      | Secret scanning                  | Security       |
| **semgrep**       | Static analysis                  | Security       |
| **biome**         | Fast formatter & linter          | Code Quality   |
| **eslint**        | JavaScript/TypeScript linting    | Code Quality   |
| **typescript**    | Type checking                    | Code Quality   |
| **knip**          | Unused exports detection         | Code Quality   |
| **actionlint**    | GitHub Actions validation        | CI/CD          |
| **markdownlint**  | Markdown style checking          | Documentation  |
| **cspell**        | Spell checking                   | Documentation  |
| **yamllint**      | YAML validation                  | Configuration  |
| **hadolint**      | Dockerfile linting               | Container      |
| **shellcheck**    | Shell script analysis            | Scripts        |
| **jscpd**         | Duplicate code detection         | Code Quality   |

---

## Examples

### Basic Usage

```bash
# Run all linters
npm run lint

# Run only ESLint and TypeScript
npm run lint -- --linters eslint,typescript

# Run with verification mode (byte-for-byte logging)
npm run lint -- --verify-logs

# Custom log directory
npm run lint -- --log-dir ./build/lint-logs
```

### Pipe-Friendly Output

The CLI is designed to work seamlessly with Unix pipes. The dashboard renders to `/dev/tty` so you can still see the full UI even when piping:

```bash
# View first 20 lines (dashboard still appears)
npm run lint | head -20

# View last 10 lines (dashboard still appears)
npm run lint | tail -10

# Pipe to a file (dashboard still appears)
npm run lint | tee output.txt
```

### CI Integration

```bash
# Authoritative CI command
npm run ci:lint

# Returns exit code 0 on success, 1 on failure
# Perfect for CI/CD pipelines
```

### NPM Script Shortcuts

```bash
# Linting (read-only)
npm run lint              # Run standard linter suite
npm run lint:all          # Run ALL available linters
npm run lint:biome        # Biome only
npm run lint:eslint       # ESLint only
npm run lint:types        # TypeScript only
npm run lint:knip         # Knip only
npm run lint:secrets      # Gitleaks only

# Linting (mutating/fixing)
npm run lint:format       # Auto-fix with Biome
npm run lint:fix          # Safe fixes (Biome + ESLint)
npm run lint:fix:unsafe   # Aggressive fixes
```

---

## Dashboard Interface

The CLI provides a beautiful terminal dashboard with real-time updates:

```text
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║              POLITICAL SPHERE — CI LINTING                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

 Linter               Status                Log

 Gitleaks             ✔ PASS                View Log
 Biome                ✔ PASS                View Log
 ESLint               ⠋ RUNNING             View Log
 TypeScript           ⠙ RUNNING             View Log
 Knip                 PENDING               -

┌────────────────────────────────────────────────────────────┐
│                                                            │
│ Summary                                                    │
│ Total: 5 | Pass: 2 | Fail: 0 | Error: 0                    │
│ Duration: 8.42s                                            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Status Indicators

- **PENDING** — Linter not yet started (dimmed)
- **RUNNING** — Currently executing (blue with spinner)
- **✔ PASS** — Completed successfully (green)
- **✘ FAIL** — Found issues (red)
- **⚠ ERROR** — Execution error (yellow)
- **SKIPPED** — Intentionally skipped (yellow)

---

## Architecture

### Design Principles

The CLI is built on these core principles:

- **Orchestration Only** — The CLI orchestrates; linter behavior is defined in the registry
- **No Business Logic** — Policy decisions are enforced by CI, not by the CLI
- **Deterministic Execution** — Identical inputs produce identical outcomes
- **Fail Fast** — Invalid input causes immediate failure
- **No Implicit Behavior** — All actions are explicit
- **Local Mirrors CI** — Local execution semantics match CI exactly

### Component Structure

```text
src/cli/
├── index.ts          # CLI entry point & orchestration
├── executor.ts       # Parallel execution engine
├── linters.ts        # Linter registry & configuration
├── ui.tsx           # Ink dashboard components
└── logger.ts        # Deterministic logging utilities
```

### Key Components

#### **index.ts** — CLI Orchestration

- Argument parsing
- Validation
- Main execution flow
- Help text generation
- Stream management for pipe-friendly output

#### **executor.ts** — Execution Engine

- Parallel linter execution using N-1 cores
- Process spawning and management
- Status tracking and updates
- Result aggregation
- Execution summary generation

#### **linters.ts** — Linter Registry

- Centralized linter definitions
- Configuration per linter
- Execution commands
- Metadata (name, category, etc.)

#### **ui.tsx** — Terminal Dashboard

- Real-time status rendering
- Color-coded indicators
- Hyperlinked log files (OSC 8 support)
- Summary footer with metrics
- Responsive layout

#### **logger.ts** — Logging System

- Deterministic log file generation
- Optional byte-for-byte verification
- Per-linter log files
- Auditable output capture

---

## Log Files

Each linter writes its output to a dedicated log file in the log directory:

```text
logs/
├── gitleaks.log
├── biome.log
├── eslint.log
├── typescript.log
├── knip.log
├── actionlint.log
└── ...
```

### Log File Format

- **Standard Mode** — Human-readable output with timestamps
- **Verification Mode** (`--verify-logs`) — Raw byte-for-byte capture for reproducibility

### Viewing Logs

Logs are hyperlinked in the dashboard (if your terminal supports OSC 8):

- Click "View Log" to open directly
- Otherwise, the full path is displayed

---

## Exit Codes

The CLI follows standard Unix exit code conventions:

| Exit Code | Meaning                                           |
| :-------- | :------------------------------------------------ |
| `0`       | All linters passed                                |
| `1`       | One or more linters failed or encountered errors  |

This makes the CLI perfect for CI/CD integration:

```bash
npm run lint && printf '✅ Success\n' || printf '❌ Failed\n'
```

---

## Troubleshooting

### Dashboard Not Rendering

If the dashboard doesn't appear:

- Ensure your terminal supports ANSI escape codes
- Check that `TERM` environment variable is set (not `dumb`)
- Verify terminal width is at least 80 characters

### Colors Not Showing

The CLI forces color output even when piped. If colors don't appear:

- Verify your terminal emulator supports 256-color mode
- Check that `FORCE_COLOR` is not being overridden
- Ensure `NO_COLOR` is not set externally

### Broken Pipe Errors

The CLI handles broken pipes gracefully (e.g., when piping to `head`). If you encounter EPIPE errors, this is a bug — please report it.

### Linter Not Found

If a linter fails with "command not found":

- Ensure all linter dependencies are installed (`npm install`)
- Check that binaries are available in `node_modules/.bin`
- Verify the linter is properly configured in `linters.ts`

---

## Development

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Interactive UI
npm run test:ui
```

### Adding a New Linter

1. **Define the linter** in `src/cli/linters.ts`:

   ```typescript
   {
     id: 'my-linter',
     name: 'My Linter',
     command: 'my-linter',
     args: ['--option', 'value'],
   }
   ```

2. **Add to the registry** in the `LINTER_REGISTRY` array

3. **Add npm script** in `package.json`:

   ```json
   {
     "scripts": {
       "lint:my-linter": "tsx ./src/cli/index.ts --linters my-linter"
     }
   }
   ```

4. **Test the integration**:

   ```bash
   npm run lint:my-linter
   ```

### Modifying the Dashboard

The dashboard is built with [Ink](https://github.com/vadimdemedes/ink), a React-based terminal UI library. Edit `src/cli/ui.tsx` to customize:

- Header styling
- Status indicators
- Table layout
- Summary footer
- Color scheme

---

## Design Decisions

### Why Parallel Execution?

Running linters sequentially is slow. By executing them in parallel, we reduce total linting time by up to 5x while maintaining full CPU utilization (N-1 cores to avoid starvation).

### Why /dev/tty for Piped Output?

When stdout is piped (e.g., `npm run lint | head`), the dashboard would normally be invisible. By rendering to `/dev/tty`, we ensure the user always sees the real-time status, regardless of piping.

### Why Deterministic Logging?

Reproducibility is critical for debugging CI failures. Deterministic logs ensure that re-running the same command produces byte-identical output, making it easier to diff results and identify changes.

### Why Single Log Directory?

Centralized logs in one directory make it easy to:

- Archive results
- Compare runs
- Integrate with log aggregation tools
- Clean up after execution

### Why Exit Code 1 for Any Failure?

CI systems need a binary signal: pass or fail. Returning exit code 1 for any failure (linter failure, execution error, etc.) provides a clear, unambiguous signal for automated workflows.

---

## Best Practices

### Local Development

```bash
# Quick check before commit
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Check types only (fast)
npm run lint:types
```

### CI/CD Integration

```bash
# Use the authoritative CI command
npm run ci:lint

# Enable verification for reproducibility
npm run lint -- --verify-logs

# Custom log directory for artifacts
npm run lint -- --log-dir ./artifacts/lint-logs
```

### Debugging Failures

```bash
# Run only the failing linter
npm run lint -- --linters eslint

# Check the log file
cat logs/eslint.log

# Re-run with verification mode
npm run lint -- --linters eslint --verify-logs
```

---

## Performance

### Benchmarks

On a typical monorepo with ~50 source files:

| Configuration                   | Time   |
| :------------------------------ | :----- |
| Sequential execution            | ~60s   |
| Parallel execution (N-1 cores)  | ~12s   |
| Single linter only              | ~2-8s  |

### Optimization Tips

- **Run frequently** — Use `lint:types` or `lint:eslint` during development
- **Fix early** — Use `lint:fix` to auto-correct issues before commit
- **Subset linters** — Use `--linters` to run only relevant checks
- **Cache results** — CI systems can cache `node_modules` for faster installs

---

## Contributing

When contributing to the CLI:

1. **Follow the principles** — Determinism, explicitness, fail-fast
2. **Test thoroughly** — Add tests for new features
3. **Update docs** — Keep this README in sync
4. **Preserve contracts** — Don't break existing CLI interfaces

---

## Related Documentation

- [Policy Engine](../policy/README.md) — Risk classification and attestation
- [CI/CD Platform](../../README.md) — Overall platform architecture
- [Linter Registry](./linters.ts) — Full linter configuration

---

## License

UNLICENSED — Internal use only for Political Sphere

---

## Acknowledgments

Built with:

- [Ink](https://github.com/vadimdemedes/ink) — React for terminal UIs
- [TypeScript](https://www.typescriptlang.org/) — Type-safe JavaScript
- [Node.js](https://nodejs.org/) — JavaScript runtime

---

## Changelog

### v0.0.1 (2026-01-07)

- ✨ Initial release
- ⚡️ Parallel linter execution
- 🎨 Real-time Ink dashboard
- 📝 Deterministic logging
- 🔧 Pipe-friendly output (renders to /dev/tty)
- 🚀 12+ supported linters
- ✅ Full test coverage
