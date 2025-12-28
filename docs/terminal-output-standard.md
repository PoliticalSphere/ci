# Terminal Output Standard

Political Sphere scripts emit two coordinated streams:

- Human-friendly output (sections, bullets, actionable messages)
- Structured records for machines (AI auditors, log processors)

This document defines the structured record format and controls.

## Structured Records (PS.LOG)

Each structured record is a single line that begins with the `PS.LOG` prefix
followed by logfmt-style key/value pairs.

Example:

```
PS.LOG schema=ps.log.v1 ts=2025-03-01T14:21:09Z level=info event=lint.step.start component=lint.eslint id=lint.eslint title=ESLINT detail="Specialist linting and TS-aware rules"
```

### Required fields

- `schema` - log schema version (`ps.log.v1`)
- `ts` - UTC timestamp in ISO 8601
- `level` - `info`, `warn`, or `error`
- `event` - stable event name (e.g., `lint.step.finish`)

### Common optional fields

- `component` - producer identifier (e.g., `lint.eslint`, `gate.pre-commit`)
- `run_id` - run correlation ID (from `PS_RUN_ID` or `GITHUB_RUN_ID`)
- `message` - human-readable message
- `status` - `PASS`, `FAIL`, `ERROR`, `SKIPPED`
- `exit_code` - numeric exit code
- `duration_ms` - duration in milliseconds
- `id`, `title`, `detail` - step metadata
- `log_path` - path to associated log file

### Logfmt rules

- Fields are `key=value` pairs separated by spaces.
- Values containing spaces, `=` or quotes are wrapped in double quotes.
- Quotes and backslashes inside values are escaped with backslashes.
- Records are ASCII-safe and single-line.

## Controls

- `PS_LOG_MODE` - structured logging control
  - `both` (default) emits structured records alongside human output
  - `human` disables structured records
  - `off`, `false`, or `0` also disable structured records
- `PS_LOG_STREAM` - `stdout` (default) or `stderr`
- `PS_LOG_PATH` - optional file path to append structured records
- `PS_LOG_COMPONENT` - override component name for a script
- `PS_LOG_SCHEMA` - override schema version (default `ps.log.v1`)

## Guidance

- Human output remains primary for developers.
- Structured records are stable, predictable, and safe to parse.
- Scripts should emit start/finish events for major steps and summarize results.
