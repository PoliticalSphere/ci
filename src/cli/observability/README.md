# CLI — Observability

> Logging, tracing, and telemetry utilities used by the CLI

This folder implements deterministic, auditable logging and lightweight distributed tracing combined with a telemetry collector for execution metrics. Observability primitives are designed for CI-safe, deterministic output that can be correlated across logs, traces, and telemetry exports.

Files

- `logger.ts` — `createLogger`, `appendToLog`, and `makeLogOptions` implement per-linter log files with both "standard" (normalized, timestamped) and "verification" (byte-for-byte) modes, optional structured JSON output, size-bounded writes, and deterministic truncation.
- `tracing.ts` — `createTraceContext`, `createChildTraceContext`, `formatTraceparent`, `parseTraceparent`, and helpers for generating trace/span IDs and serializing contexts.
- `telemetry.ts` — `TelemetryCollector` for recording per-linter metrics, calculating aggregate `TelemetryStats`, and exporting metrics as JSON; includes a simple global registry (`getGlobalTelemetry`, `resetGlobalTelemetry`).
- Tests: `logger.test.ts`, `tracing.test.ts`, `telemetry.test.ts` provide coverage for formatting, parsing, export, and error handling.

Key behaviors & guarantees

- One log file per linter (e.g., `logs/eslint.log`), with deterministic formatting to aid verification and auditing.
- Two logging modes:
  - **Standard**: lines are normalized, timestamped, and may include a short trace hint for readability.
  - **Verification**: raw byte-for-byte capture for exact reproducibility in `--verify-logs` mode.
- Structured logs option emits JSON per-line with `timestamp`, `linterId`, `message`, and optional trace fields for correlation.
- Bounded writes: optional `maxBytes` ensures deterministic truncation with a clear `[TRUNCATED]` note.
- Tracing follows a simplified W3C-like format (traceparent) with helpers to generate, format, parse, and create child spans.
- Telemetry is non-blocking, sampling-aware, and exportable as JSON for later analysis; includes methods for per-linter exports and aggregate stats.

Design & safety notes ⚠️

- `logger.ts` validates `linterId` format before constructing log paths to avoid directory traversal or invalid file names.
- Log directory is ensured to exist (`mkdir`) before writes; errors such as disk full (`ENOSPC`) are normalized for clearer diagnostics.
- Tracing IDs are random hex strings and validated when parsing `traceparent` headers to avoid accepting malformed or malicious input.
- Telemetry collector is intentionally lightweight and uses an in-memory ring to bound memory consumption.

Testing guidance ✅

- Logger tests should cover:
  - Standard vs structured output formatting (line splitting, timestamp handling)
  - Verification mode preserves raw bytes
  - Bounded `maxBytes` truncation note behavior and deterministic output
  - `appendToLog` append semantics and error normalization (e.g., ENOSPC)
- Tracing tests should cover ID generation, `formatTraceparent`/`parseTraceparent` roundtrips, and child context semantics.
- Telemetry tests should cover metric recording, boundary behavior when max entries are hit, `calculateStats()` values, and `export()` formats.

Examples

- Create a logger and write stream processor

```ts
import { makeLogOptions, createLogger } from './observability/logger';
const opts = makeLogOptions({ logDir: './logs', linterId: 'eslint', verifyMode: false, structured: true });
const logger = await createLogger(opts);
await logger(process.stdin); // example: pipe a readable into the logger
```

- Use tracing helpers

```ts
import { createTraceContext, formatTraceparent, parseTraceparent } from './observability/tracing';
const ctx = createTraceContext();
const header = formatTraceparent(ctx);
const parsed = parseTraceparent(header);
```

- Collect telemetry

```ts
import { getGlobalTelemetry } from './observability/telemetry';
const telemetry = getGlobalTelemetry();
const exec = telemetry.startExecution('eslint', createTraceContext());
telemetry.recordExecution(exec, 1024, true);
const out = telemetry.export();
```

Notes

- Observability primitives are used throughout the execution and modules layers. When modifying structured output or trace formats, update tests and the telemetry export shape to maintain compatibility for downstream analysis tools.
