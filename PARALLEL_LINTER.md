# Political Sphere Parallel Linter CLI

## Overview

A **world-class, high-speed, parallel-execution CLI** for running security and code linters with a flicker-free, real-time terminal dashboard and auditable logs.

## Features

### Core Capabilities

- ⚡ **Parallel Execution**: Runs linters concurrently using N-1 CPU cores for maximum speed
- 🎨 **Zero-Flicker UI**: React-based terminal UI (Ink) with Virtual DOM rendering
- ⏱️ **Automatic Timeouts**: Each linter has configurable timeouts with graceful handling
- 🔗 **Clickable Log Links**: OSC 8 hyperlinks that open logs directly from the terminal
- 📝 **Dual-Stream Logging**:
  - **Standard Mode**: Formatted logs with timestamps and linter IDs
  - **Verification Mode**: Raw byte-for-byte logging for audit compliance
- 🎯 **Real-Time Status Updates**: Live dashboard with status indicators
- 🛡️ **Robust Error Handling**: Binary checks, timeout detection, and graceful failures

### Supported Linters

1. **Gitleaks** - Secret detection and leak prevention
2. **Semgrep** - Static analysis for security and code quality
3. **Biome** - Fast linter and formatter
4. **ESLint** - JavaScript/TypeScript linter
5. **TypeScript** - Type checking
6. **Knip** - Dead code detection
7. **Markdownlint** - Markdown linter
8. **CSpell** - Spell checker
9. **JSCPD** - Copy-paste detection

## Installation

The CLI is bundled with the Political Sphere CI package:

```bash
npm install
```

## Usage

### Basic Usage

Run core linters (recommended for fast feedback):

```bash
npm run lint
```

Run all linters including markdown, spelling, and duplication:

```bash
npm run lint:all
```

### Command-Line Options

```bash
ps-lint [OPTIONS]

OPTIONS:
  --verify-logs         Enable raw byte-for-byte logging (verification mode)
  --log-dir <path>      Directory for log files (default: ./logs)
  --linters <list>      Comma-separated list of linters to run
                        Available: gitleaks, biome, eslint, typescript, 
                                  knip, markdownlint, cspell, jscpd, semgrep
                        Default: All linters
  --help                Show this help message
```

### Examples

#### Run core linters (fast)

```bash
npm run lint
```

#### Run all linters

```bash
npm run lint:all
```

#### Run specific linters

```bash
npm run lint:all -- --linters gitleaks,biome,eslint
```

#### Use verification mode (raw logs)

```bash
npm run lint -- --verify-logs
```

#### Custom log directory

```bash
npm run lint:all -- --log-dir ./build/lint-logs
```

#### Run with verification and custom directory

```bash
npm run lint:all -- --verify-logs --log-dir ./audit-logs
```

## Architecture

### Technical Stack

- **Runtime**: Node.js 22 (ESM)
- **UI Engine**: Ink (React for Terminal)
- **Concurrency**: p-map with controlled parallelism
- **Process Management**: `node:child_process` with native `AbortSignal.timeout()`
- **File Discovery**: Native `node:fs/promises`

### Component Overview

```bash
src/cli/
├── index.ts          # CLI entry point and orchestration
├── linters.ts        # Linter registry and configuration
├── executor.ts       # Parallel execution engine
├── logger.ts         # Dual-stream logging system
└── ui.tsx            # Ink UI components
```

### Execution Flow

1. **Init Phase**: Parse arguments, validate linters, set up log directory
2. **Render Phase**: Initialize Ink dashboard with pending states
3. **Dispatch Phase**: Submit linter tasks to p-map queue
4. **Execution Phase**: Run linters with timeouts and stream logs
5. **Update Phase**: UI updates in real-time as statuses change
6. **Finalize Phase**: Display summary and exit with appropriate code

### Concurrency Model

- **CPU-Based**: Concurrency = `max(1, CPU_COUNT - 1)`
- **Non-Blocking**: Uses p-map for controlled parallel execution
- **Timeout Handling**: Each linter wrapped in `AbortSignal.timeout()`
- **Graceful Shutdown**: SIGKILL on timeout, proper cleanup

## UI Specification

### Header

```text
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                     POLITICAL SPHERE: LINTING                     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Status Table

| Linter Name | Status | Log Link |
| ----------- | -------------- | --------- |
| Gitleaks | ⠋ RUNNING... | View Log |
| Biome | ✔ PASS | View Log |
| ESLint | ✘ FAIL | View Log |
| TypeScript | ⚠ ERROR | View Log |

### Status Indicators

- `PENDING` - Gray, waiting to start
- `⠋ RUNNING...` - Blue with spinner
- `✔ PASS` - Green, exit code 0
- `✘ FAIL` - Red, exit code > 0 (found issues)
- `⚠ ERROR` - Yellow/Orange, timeout or binary missing

### Summary Footer

```text
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│  Summary                                                          │
│  Total: 8 | Passed: 6 | Failed: 1 | Errors: 1                     │
│  Duration: 12.45s                                                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Logging System

### Standard Mode (Default)

Logs are formatted with timestamps and linter IDs:

```log
[2026-01-07T14:18:48.401Z] [biome] src/cli/executor.ts:169:3
[2026-01-07T14:18:48.403Z] [biome]  lint/style/useConst  FIXABLE
[2026-01-07T14:18:48.403Z] [biome]   × This let declares a variable...
```

### Verification Mode (`--verify-logs`)

Raw byte-for-byte output from the linter:

```log
2:19PM INF 267 commits scanned.
2:19PM INF scanned ~7464698 bytes (7.46 MB) in 3.18s
2:19PM INF no leaks found
```

### Log Structure

```bash
logs/
├── gitleaks.log
├── biome.log
├── eslint.log
├── typescript.log
├── knip.log
├── markdownlint.log
├── cspell.log
└── jscpd.log
```

## Error Handling Matrix

| Event | Action | Outcome |
| ----- | ------ | --------- |
| Linter finds issues | Exit code > 0 | Status → `FAIL` (Red) |
| Binary not found | Error on spawn | Status → `ERROR` (Orange) |
| Timeout exceeded | AbortSignal triggered | Status → `ERROR` (TIMEOUT) |
| Process error | Caught exception | Status → `ERROR` with message |
| User clicks log link | OSC 8 hyperlink | Opens `./logs/linter.log` |

## Exit Codes

- **0**: All linters passed successfully
- **1**: One or more linters failed or errored

## Performance Characteristics

- **Startup**: < 100ms
- **Typical Run**: 3-15s (depending on codebase size)
- **UI Updates**: Real-time with zero flicker
- **Memory**: Streams logs to disk, minimal memory footprint
- **CPU**: Utilizes N-1 cores efficiently

## Configuration

### Linter Timeouts

Default timeouts (configurable in [linters.ts](src/cli/linters.ts)):

- Gitleaks: 60s
- Biome: 60s
- ESLint: 90s
- TypeScript: 120s
- Knip: 60s
- Markdownlint: 30s
- CSpell: 60s
- JSCPD: 60s

### Adding New Linters

Edit [linters.ts](src/cli/linters.ts):

```typescript
{
  id: 'custom-linter',
  name: 'CustomLinter',
  binary: 'custom-linter',
  args: ['--check', '.'],
  timeout: 60000,
  description: 'Custom linter description',
}
```

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Run Parallel Linters
  run: npm run lint:parallel
```

### With Verification Mode

```yaml
- name: Run Parallel Linters (Audit Mode)
  run: npm run lint:parallel -- --verify-logs --log-dir ./audit-logs

- name: Upload Audit Logs
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: audit-logs
    path: audit-logs/
```

## Troubleshooting

### Binary Not Found

If you see `ERROR: Binary not found`, ensure the linter is installed:

```bash
npm install
```

### Timeout Errors

Increase timeout in [linters.ts](src/cli/linters.ts) for slow linters.

### Logs Not Created

Check that the log directory is writable:

```bash
ls -la logs/
```

## Design Principles

1. **Speed Through Concurrency** - Maximize throughput with parallel execution
2. **Trust Through Verification** - Raw logs enable byte-for-byte audit
3. **Clarity Through UI** - Zero-flicker dashboard provides instant feedback
4. **Reliability Through Timeouts** - No hanging processes, graceful failures
5. **Auditability By Design** - All output logged, all decisions traceable

## Development

### Running Tests

```bash
npm test
```

### Type Checking

```bash
npm run lint:types
```

### Code Quality

```bash
npm run lint
```

## License

UNLICENSED - Private repository for Political Sphere

## Support

For issues or questions, please contact the Political Sphere development team.
