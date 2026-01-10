/**
 * Political Sphere — Distributed Tracing
 *
 * Role:
 *   Generate and manage correlation IDs for distributed tracing across
 *   multiple linter executions and log streams.
 *
 * Guarantees:
 *   - Unique trace IDs per execution
 *   - Consistent trace ID throughout logging lifecycle
 *   - W3C Trace Context compatible format (simplified)
 */

import { randomBytes } from 'node:crypto';

/**
 * Trace context containing correlation IDs and metadata.
 */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly samplingDecision: boolean;
}

/**
 * Generate a random hex string of specified length.
 * @param {number} bytes Number of bytes to generate (result will be 2x this length in hex)
 */
function generateRandomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generate a new trace ID following W3C Trace Context format.
 * Format: 32 hex digits (16 bytes)
 */
export function generateTraceId(): string {
  return generateRandomHex(16);
}

/**
 * Generate a new span ID following W3C Trace Context format.
 * Format: 16 hex digits (8 bytes)
 */
export function generateSpanId(): string {
  return generateRandomHex(8);
}

/**
 * Create a new trace context for a logging session.
 * @param {string|undefined} traceId Optional trace ID; generates one if not provided
 * @param {boolean} samplingDecision Whether this trace should be sampled for metrics
 */
export function createTraceContext(traceId?: string, samplingDecision = true): TraceContext {
  return {
    traceId: traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    samplingDecision,
  };
}

/**
 * Create a child trace context for nested operations within the same trace.
 * Preserves the trace ID but generates a new span ID.
 */
export function createChildTraceContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    samplingDecision: parent.samplingDecision,
  };
}

/**
 * Format trace context as W3C traceparent header.
 * Format: version-traceId-spanId-traceFlags
 *
 * @example
 * formatTraceparent(ctx) // "00-abc123...-def456...-01"
 */
export function formatTraceparent(ctx: TraceContext): string {
  const version = '00';
  const traceFlags = ctx.samplingDecision ? '01' : '00';
  return `${version}-${ctx.traceId}-${ctx.spanId}-${traceFlags}`;
}

/**
 * Parse W3C traceparent header into a trace context.
 * Returns null if the header is malformed.
 */
export function parseTraceparent(traceparent: string): TraceContext | null {
  const parts = traceparent.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, traceFlags] = parts;

  // Validate expected lengths and types rather than relying on truthiness checks.
  if (
    version !== '00' ||
    typeof traceId !== 'string' ||
    traceId.length !== 32 ||
    typeof spanId !== 'string' ||
    spanId.length !== 16 ||
    typeof traceFlags !== 'string' ||
    traceFlags.length !== 2
  ) {
    return null;
  }

  if (!/^[0-9a-f]{2}$/i.test(traceFlags)) {
    return null;
  }

  const samplingDecision = traceFlags !== '00';

  return {
    traceId,
    spanId,
    samplingDecision,
  };
}

/**
 * Convert trace context to a structured JSON representation.
 */
export interface TraceContextJSON {
  traceId: string;
  spanId: string;
  sampled: boolean;
  parentSpanId?: string;
}

/**
 *
 */
export function traceContextToJSON(ctx: TraceContext): TraceContextJSON {
  const result: TraceContextJSON = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    sampled: ctx.samplingDecision,
  };
  if (ctx.parentSpanId !== undefined) {
    result.parentSpanId = ctx.parentSpanId;
  }
  return result;
}
