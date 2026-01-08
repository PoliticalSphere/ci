/**
 * Political Sphere — Tracing Tests
 */

import { describe, expect, it } from 'vitest';

import {
  createChildTraceContext,
  createTraceContext,
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
  traceContextToJSON,
} from './tracing.ts';

describe('Political Sphere — Tracing', () => {
  describe('generateTraceId', () => {
    it('generates a 32-character hex string', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(traceId.length).toBe(32);
    });

    it('generates unique trace IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateSpanId', () => {
    it('generates a 16-character hex string', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[a-f0-9]{16}$/);
      expect(spanId.length).toBe(16);
    });

    it('generates unique span IDs', () => {
      const id1 = generateSpanId();
      const id2 = generateSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('createTraceContext', () => {
    it('generates a trace context with new IDs when none provided', () => {
      const ctx = createTraceContext();
      expect(ctx.traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(ctx.spanId).toMatch(/^[a-f0-9]{16}$/);
      expect(ctx.parentSpanId).toBeUndefined();
      expect(ctx.samplingDecision).toBe(true);
    });

    it('uses provided trace ID', () => {
      const providedId = generateTraceId();
      const ctx = createTraceContext(providedId);
      expect(ctx.traceId).toBe(providedId);
      expect(ctx.spanId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('respects sampling decision parameter', () => {
      const ctxSampled = createTraceContext(undefined, true);
      const ctxNotSampled = createTraceContext(undefined, false);
      expect(ctxSampled.samplingDecision).toBe(true);
      expect(ctxNotSampled.samplingDecision).toBe(false);
    });
  });

  describe('createChildTraceContext', () => {
    it('preserves parent trace ID', () => {
      const parent = createTraceContext();
      const child = createChildTraceContext(parent);
      expect(child.traceId).toBe(parent.traceId);
    });

    it('generates a new span ID', () => {
      const parent = createTraceContext();
      const child = createChildTraceContext(parent);
      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.spanId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('sets parent span ID', () => {
      const parent = createTraceContext();
      const child = createChildTraceContext(parent);
      expect(child.parentSpanId).toBe(parent.spanId);
    });

    it('preserves sampling decision', () => {
      const parent = createTraceContext(undefined, false);
      const child = createChildTraceContext(parent);
      expect(child.samplingDecision).toBe(false);
    });
  });

  describe('formatTraceparent', () => {
    it('formats trace context as W3C traceparent header', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const ctx = { traceId, spanId, samplingDecision: true };
      const formatted = formatTraceparent(ctx);
      expect(formatted).toBe(`00-${traceId}-${spanId}-01`);
    });

    it('uses trace flag 00 when not sampled', () => {
      const ctx = createTraceContext(undefined, false);
      const formatted = formatTraceparent(ctx);
      expect(formatted.endsWith('-00')).toBe(true);
    });

    it('uses trace flag 01 when sampled', () => {
      const ctx = createTraceContext(undefined, true);
      const formatted = formatTraceparent(ctx);
      expect(formatted.endsWith('-01')).toBe(true);
    });
  });

  describe('parseTraceparent', () => {
    it('parses a valid traceparent header', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const header = `00-${traceId}-${spanId}-01`;
      const parsed = parseTraceparent(header);
      expect(parsed).toEqual({
        traceId,
        spanId,
        samplingDecision: true,
      });
    });

    it('parses sampling decision correctly', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const notSampledHeader = `00-${traceId}-${spanId}-00`;
      const parsed = parseTraceparent(notSampledHeader);
      expect(parsed?.samplingDecision).toBe(false);
    });

    it('returns null for malformed headers', () => {
      expect(parseTraceparent('invalid')).toBeNull();
      expect(parseTraceparent('00-abc-def')).toBeNull();
      expect(parseTraceparent(`01-${'a'.repeat(32)}-${'b'.repeat(16)}-01`)).toBeNull();
      expect(parseTraceparent(`00-${'a'.repeat(31)}-${'b'.repeat(16)}-01`)).toBeNull();
      expect(parseTraceparent(`00-${'a'.repeat(32)}-${'b'.repeat(15)}-01`)).toBeNull();
    });

    it('round-trips correctly', () => {
      const original = createTraceContext();
      const formatted = formatTraceparent(original);
      const parsed = parseTraceparent(formatted);
      expect(parsed?.traceId).toBe(original.traceId);
      expect(parsed?.spanId).toBe(original.spanId);
      expect(parsed?.samplingDecision).toBe(original.samplingDecision);
    });
  });

  describe('traceContextToJSON', () => {
    it('converts trace context to JSON representation', () => {
      const ctx = createTraceContext(undefined, true);
      const json = traceContextToJSON(ctx);
      expect(json).toHaveProperty('traceId', ctx.traceId);
      expect(json).toHaveProperty('spanId', ctx.spanId);
      expect(json).toHaveProperty('sampled', true);
    });

    it('includes parent span ID when present', () => {
      const parent = createTraceContext();
      const child = createChildTraceContext(parent);
      const json = traceContextToJSON(child);
      expect(json).toHaveProperty('parentSpanId', child.parentSpanId);
    });

    it('omits parent span ID when not present', () => {
      const ctx = createTraceContext();
      const json = traceContextToJSON(ctx);
      expect(json).not.toHaveProperty('parentSpanId');
    });
  });
});
