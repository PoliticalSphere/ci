interface StructuredPayload {
  timestamp: string;
  linterId: string;
  message: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string | undefined;
  sampled?: boolean;
}

/**
 * Political Sphere — Logging System
 *
 * Role:
 *   Deterministic, auditable logging for CI execution with distributed tracing support.
 *
 * Guarantees:
 *   - One log file per linter
 *   - Ordered, complete output
 *   - Verification mode preserves byte-for-byte output
 *   - Standard mode normalizes output deterministically
 *   - Trace IDs included in structured logs for correlation
 *
 * Non-goals:
 *   - No buffering of entire streams
 *   - No policy decisions
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline, Transform } from 'node:stream';
import { promisify } from 'node:util';

import type { TraceContext } from './tracing.ts';

const pipelineAsync = promisify(pipeline);

export interface LogOptions {
  readonly logDir: string;
  readonly linterId: string;
  readonly verifyMode: boolean;
  readonly structured?: boolean;
  /** Maximum bytes to write; logs beyond this are truncated deterministically. */
  readonly maxBytes?: number;
  /** Optional trace context for distributed tracing correlation. */
  readonly traceContext?: TraceContext;
}

/**
 * Build `LogOptions` with optional fields in a type-safe manner.
 */
export function makeLogOptions(opts: {
  logDir: string;
  linterId: string;
  verifyMode: boolean;
  structured?: boolean;
  maxBytes?: number;
  traceContext?: TraceContext;
}): LogOptions {
  const { logDir, linterId, verifyMode, structured, maxBytes, traceContext } = opts;

  const built: LogOptions = {
    logDir,
    linterId,
    verifyMode,
    ...(structured === undefined ? {} : { structured }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
    ...(traceContext === undefined ? {} : { traceContext }),
  };

  return built;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Determine a log path for the provided linter under the configured log dir.
 */
function getLogPath(logDir: string, linterId: string): string {
  return `${logDir}/${linterId}.log`;
}

/**
 * Create the directory in which the linter log files will live.
 */
async function ensureLogDirectory(logDir: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(logDir, { recursive: true });
}

/* -------------------------------------------------------------------------- */
/* Base transform factory for line-safe, chunk-safe processing                */
/* -------------------------------------------------------------------------- */

type LineProcessor = (line: string) => string;

/**
 * Format the buffered chunk with a timestamp and optional trace context.
 */
function processFlushWithTimestamp(
  buffer: string,
  id: string,
  traceContext?: TraceContext,
): string {
  const timestamp = new Date().toISOString();
  const traceId = traceContext ? ` [trace=${String(traceContext.traceId).slice(0, 8)}]` : '';
  return `[${timestamp}] [${id}]${traceId} ${buffer}`;
}

/**
 * Format buffered chunk as JSON payload for structured logging.
 */
function processFlushStructured(buffer: string, id: string, traceContext?: TraceContext): string {
  const payload: StructuredPayload = {
    timestamp: new Date().toISOString(),
    linterId: id,
    message: buffer,
  };

  if (traceContext) {
    payload.traceId = traceContext.traceId;
    payload.spanId = traceContext.spanId;
    payload.parentSpanId = traceContext.parentSpanId;
    payload.sampled = traceContext.samplingDecision;
  }

  return JSON.stringify(payload);
}

/**
 * Build a transform stream that buffers chunks until line boundaries appear.
 */
function createBufferingTransform(
  linterId: string,
  processLine: LineProcessor,
  processFlush: (buffer: string, linterId: string, traceContext?: TraceContext) => string,
  traceContext?: TraceContext,
): Transform {
  let buffer = '';

  return new Transform({
    transform(chunk: Buffer, _enc, cb): void {
      buffer += chunk.toString('utf8');

      for (;;) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        this.push(`${processLine(line)}\n`);
      }

      cb();
    },

    flush(cb): void {
      if (buffer.length > 0) {
        this.push(`${processFlush(buffer, linterId, traceContext)}\n`);
      }
      cb();
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Normalizing transform (line-safe, chunk-safe)                               */
/* -------------------------------------------------------------------------- */

/**
 * Transform that normalizes logs for readability and correlation.
 */
function createNormalizingTransform(linterId: string, traceContext?: TraceContext): Transform {
  const processLine: LineProcessor = (line: string) => {
    const timestamp = new Date().toISOString();
    const traceId = traceContext ? ` [trace=${String(traceContext.traceId).slice(0, 8)}]` : '';
    const suffix = line.length === 0 ? '' : ` ${line}`;
    return `[${timestamp}] [${linterId}]${traceId}${suffix}`;
  };

  return createBufferingTransform(linterId, processLine, processFlushWithTimestamp, traceContext);
}

/**
 * Transform that emits JSON structured log payloads.
 */
function createStructuredTransform(linterId: string, traceContext?: TraceContext): Transform {
  const processLine: LineProcessor = (line: string) => {
    const payload: StructuredPayload = {
      timestamp: new Date().toISOString(),
      linterId,
      message: line,
    };

    if (traceContext) {
      payload.traceId = traceContext.traceId;
      payload.spanId = traceContext.spanId;
      payload.parentSpanId = traceContext.parentSpanId;
      payload.sampled = traceContext.samplingDecision;
    }

    return JSON.stringify(payload);
  };

  return createBufferingTransform(linterId, processLine, processFlushStructured, traceContext);
}

/**
 * Create a transform that truncates output after a certain byte budget.
 */
function createBoundedTransform(
  linterId: string,
  structured: boolean,
  maxBytes?: number,
): Transform {
  if (maxBytes === undefined) {
    return new Transform({
      transform(chunk, _enc, cb) {
        this.push(chunk);
        cb();
      },
    });
  }

  let remaining = Math.max(0, maxBytes);
  let truncated = false;

  return new Transform({
    transform(chunk: Buffer, _enc, cb): void {
      if (remaining <= 0) {
        cb();
        return;
      }

      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      this.push(slice);
      remaining -= slice.length;

      if (chunk.length > slice.length && truncated === false) {
        truncated = true;
        const timestamp = new Date().toISOString();
        const note = structured
          ? `${JSON.stringify({ timestamp, linterId, message: '[TRUNCATED]' })}\n`
          : `[${timestamp}] [${linterId}] [TRUNCATED at ${maxBytes} bytes]\n`;
        this.push(note);
        remaining = 0;
      }

      cb();
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Logging modes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Pipe the linter output through normalization/structured transforms for main mode.
 */
async function logStandardMode(
  readStream: NodeJS.ReadableStream,
  writeStream: WriteStream,
  linterId: string,
  structured: boolean,
  maxBytes?: number,
  traceContext?: TraceContext,
): Promise<void> {
  const format = structured
    ? createStructuredTransform(linterId, traceContext)
    : createNormalizingTransform(linterId, traceContext);
  const bound = createBoundedTransform(linterId, structured, maxBytes);
  await pipelineAsync(readStream, format, bound, writeStream);
}

/**
 * Pipe the output directly when verification mode is enabled (byte-for-byte).
 */
async function logVerificationMode(
  readStream: NodeJS.ReadableStream,
  writeStream: WriteStream,
  linterId: string,
  maxBytes?: number,
): Promise<void> {
  const bound = createBoundedTransform(linterId, false, maxBytes);
  await pipelineAsync(readStream, bound, writeStream);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Create a logger function for a single linter run.
 *
 * @param options - Configuration describing log directory, linter id, structured output, etc.
 * @returns Async function that consumes a readable stream and writes to disk.
 */
export async function createLogger(
  options: LogOptions,
): Promise<(readStream: NodeJS.ReadableStream) => Promise<void>> {
  await ensureLogDirectory(options.logDir);

  const logPath = getLogPath(options.logDir, options.linterId);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const writeStream = createWriteStream(logPath, { flags: 'w' });

  return async (readStream: NodeJS.ReadableStream): Promise<void> => {
    try {
      if (options.verifyMode) {
        await logVerificationMode(readStream, writeStream, options.linterId, options.maxBytes);
      } else {
        await logStandardMode(
          readStream,
          writeStream,
          options.linterId,
          options.structured === true,
          options.maxBytes,
          options.traceContext,
        );
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });
    }
  };
}

/**
 * Append a single message to a linter log.
 *
 * Used for deterministic error and skip reporting.
 */
export async function appendToLog(
  logDir: string,
  linterId: string,
  message: string,
): Promise<void> {
  await ensureLogDirectory(logDir);

  const logPath = getLogPath(logDir, linterId);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const writeStream = createWriteStream(logPath, { flags: 'a' });

  return new Promise<void>((resolve, reject) => {
    writeStream.write(`${message}\n`, (error) => {
      writeStream.end();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
