/**
 * Political Sphere — Logger Tests
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendToLog, createLogger, makeLogOptions } from './logger.ts';
import { createTraceContext } from './tracing.ts';

const fixedDate = new Date('2024-01-01T00:00:00.000Z');

let tempDir = '';

async function readLog(linterId: string): Promise<string> {
  const p = path.join(tempDir, `${linterId}.log`);
  return readFile(p, 'utf8');
}

// Helper to mock fs with write failures
async function mockFsWithWriteFailure() {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    createWriteStream: vi.fn(() => ({
      write: (_data: string, cb: (error?: Error | null) => void) => {
        cb(new Error('write failed'));
        return true;
      },
      end: vi.fn(),
    })),
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'ps-ci-test-logs-'));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe('Political Sphere — Logger', () => {
  it('builds LogOptions with provided optional values', () => {
    const traceContext = createTraceContext();
    const logDir = `${tmpdir()}/test-logs-${process.pid}`;

    const built = makeLogOptions({
      logDir,
      linterId: 'lint-a',
      verifyMode: true,
      structured: true,
      maxBytes: 128,
      traceContext,
    });

    expect(built).toEqual({
      logDir,
      linterId: 'lint-a',
      verifyMode: true,
      structured: true,
      maxBytes: 128,
      traceContext,
    });
  });

  it('omits optional fields when not provided to makeLogOptions', () => {
    const logDir = `${tmpdir()}/test-logs-${process.pid}`;

    const built = makeLogOptions({
      logDir,
      linterId: 'lint-b',
      verifyMode: false,
    });

    expect(built).toEqual({
      logDir,
      linterId: 'lint-b',
      verifyMode: false,
    });
  });

  it('normalizes output in standard mode and preserves blank lines', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'eslint',
      verifyMode: false,
    });

    const inputChunks = ['first\n   \nsec', 'ond line\npartial'];
    await logger(Readable.from(inputChunks));

    const stamp = fixedDate.toISOString();
    const expected =
      `[${stamp}] [eslint] first\n` +
      `[${stamp}] [eslint]    \n` +
      `[${stamp}] [eslint] second line\n` +
      `[${stamp}] [eslint] partial\n`;

    const out = await readLog('eslint');
    expect(out).toBe(expected);
  });

  it('handles truly empty lines (consecutive newlines)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'empty-line',
      verifyMode: false,
    });

    // Two consecutive newlines create an empty line (line.length === 0)
    await logger(Readable.from(['before\n\nafter\n']));

    const stamp = fixedDate.toISOString();
    const expected =
      `[${stamp}] [empty-line] before\n` +
      `[${stamp}] [empty-line]\n` +
      `[${stamp}] [empty-line] after\n`;

    const out = await readLog('empty-line');
    expect(out).toBe(expected);
  });

  it('does not emit an extra line when input ends with a newline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'knip',
      verifyMode: false,
    });

    await logger(Readable.from(['only line\n']));

    const out = await readLog('knip');
    expect(out).toBe(`[${fixedDate.toISOString()}] [knip] only line\n`);
  });

  it('preserves output exactly in verify mode', async () => {
    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'biome',
      verifyMode: true,
    });

    const payload = 'raw line 1\nraw line 2\n';
    await logger(Readable.from([payload]));

    const out = await readLog('biome');
    expect(out).toBe(payload);
  });

  it('appends a message to the log', async () => {
    await appendToLog(tempDir, 'typescript', 'hello');

    const out = await readLog('typescript');
    expect(out).toBe('hello\n');
  });

  it('surfaces write failures when appending', async () => {
    vi.resetModules();
    vi.doMock('node:fs', mockFsWithWriteFailure);

    try {
      const { appendToLog: appendToLogWithError } = await import('./logger.ts');

      await expect(appendToLogWithError(tempDir, 'typescript', 'boom')).rejects.toThrow(
        'write failed',
      );
    } finally {
      vi.unmock('node:fs');
    }
  });

  it('does not emit line from flush when buffer is empty', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'test',
      verifyMode: false,
    });

    // Send content that ends with newline, so buffer will be empty on flush
    await logger(Readable.from(['content\n']));

    const out = await readLog('test');
    const lines = out.split('\n').filter((l) => l.trim());
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('content');
  });

  it('flushes remaining buffer content without trailing newline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'flush-test',
      verifyMode: false,
    });

    // Send content WITHOUT trailing newline to trigger flush with buffer.length > 0
    await logger(Readable.from(['no-newline-at-end']));

    const out = await readLog('flush-test');
    const stamp = fixedDate.toISOString();
    expect(out).toBe(`[${stamp}] [flush-test] no-newline-at-end\n`);
  });

  it('supports structured JSON output', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'json',
      verifyMode: false,
      structured: true,
    });

    await logger(Readable.from(['hello json']));

    const out = await readLog('json');
    const parsed = out
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(parsed).toEqual([
      {
        timestamp: fixedDate.toISOString(),
        linterId: 'json',
        message: 'hello json',
      },
    ]);
  });

  it('streams structured lines when newlines are present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'json-stream',
      verifyMode: false,
      structured: true,
    });

    await logger(Readable.from(['line-one\nline-two\n']));

    const logContent = await readLog('json-stream');
    const parsed = logContent
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(parsed.map((p) => p.message)).toEqual(['line-one', 'line-two']);
  });

  it('flushes structured output when no trailing newline is present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'json-flush',
      verifyMode: false,
      structured: true,
    });

    await logger(Readable.from(['lonely-structured']));

    const logContent = await readLog('json-flush');
    const parsed = logContent
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(parsed).toEqual([
      {
        timestamp: fixedDate.toISOString(),
        linterId: 'json-flush',
        message: 'lonely-structured',
      },
    ]);
  });

  it('truncates logs when maxBytes is provided', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'bounded',
      verifyMode: false,
      maxBytes: 50,
    });

    // cspell: disable-next-line
    await logger(Readable.from(['0123456789ABCDEFGHIJEXTRA']));

    const out = await readLog('bounded');
    expect(out).toContain('[TRUNCATED');
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it('stops emitting after truncation even when more data arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'bounded-more',
      verifyMode: false,
      maxBytes: 10,
    });

    await logger(Readable.from(['first-chunk', 'second']));

    const out = await readLog('bounded-more');
    expect(out).toContain('[TRUNCATED');
    expect(out).not.toContain('second');
  });

  it('emits structured truncation notes when bounded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'bounded-structured',
      verifyMode: false,
      structured: true,
      maxBytes: 5,
    });

    // cspell: disable-next-line
    await logger(Readable.from(['toolong-content']));

    const logContent = await readLog('bounded-structured');
    const lines = logContent.trim().split('\n');
    const last = lines.at(-1);
    const jsonPortion = last?.slice(last.lastIndexOf('{"timestamp"')) ?? '';
    const note = JSON.parse(jsonPortion);

    expect(note.message).toBe('[TRUNCATED]');
  });

  it('drops all data after truncation via transform early return and flush', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'bounded-flush-test',
      verifyMode: true,
      maxBytes: 5,
    });

    // First chunk exceeds bound, truncation note emitted, remaining = 0
    // Second chunk triggers early return at remaining <= 0
    await logger(Readable.from(['123456', 'extra']));

    const out = await readLog('bounded-flush-test');
    expect(out).toContain('12345');
    expect(out).toContain('[TRUNCATED at 5 bytes]');
    expect(out).not.toContain('extra');
  });

  it('flush returns early when remaining is 0 after truncation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const logger = await createLogger({
      logDir: tempDir,
      linterId: 'verify-flush-early',
      verifyMode: true,
      maxBytes: 20,
    });

    await logger(Readable.from(['0123456789', '01234567890123456789xyz']));

    const out = await readLog('verify-flush-early');
    expect(out).toContain('[TRUNCATED at 20 bytes]');
    expect(out.length).toBeLessThanOrEqual(150);
  });

  describe('trace context support', () => {
    async function parseFirstStructuredLog(linterId: string) {
      const out = await readLog(linterId);
      const lines = out.trim().split('\n');
      return JSON.parse(lines[0]);
    }

    it('includes trace ID in normalizing mode', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const traceContext = createTraceContext();
      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'eslint',
        verifyMode: false,
        traceContext,
      });

      await logger(Readable.from(['test output\n']));

      const out = await readLog('eslint');
      const traceIdShort = traceContext.traceId.slice(0, 8);
      expect(out).toContain(`[trace=${traceIdShort}]`);
    });

    it('includes trace context when flushing buffered normal output', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const traceContext = createTraceContext();
      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'flush-normal-trace',
        verifyMode: false,
        traceContext,
      });

      // No trailing newline ensures the flush path runs.
      await logger(Readable.from(['buffer-without-newline']));

      const out = await readLog('flush-normal-trace');
      const traceIdShort = traceContext.traceId.slice(0, 8);
      expect(out).toContain(`[trace=${traceIdShort}] buffer-without-newline`);
      expect(out.trim().split('\n').length).toBe(1);
    });

    it('includes full trace context in structured mode', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const traceContext = createTraceContext();
      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'eslint',
        verifyMode: false,
        structured: true,
        traceContext,
      });

      await logger(Readable.from(['test output\n']));

      const parsed = await parseFirstStructuredLog('eslint');

      expect(parsed).toHaveProperty('traceId', traceContext.traceId);
      expect(parsed).toHaveProperty('spanId', traceContext.spanId);
      expect(parsed).toHaveProperty('sampled', traceContext.samplingDecision);
    });

    it('does not include trace context when not provided', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'eslint',
        verifyMode: false,
        structured: true,
      });

      await logger(Readable.from(['test output\n']));

      const parsed = await parseFirstStructuredLog('eslint');

      expect(parsed).not.toHaveProperty('traceId');
      expect(parsed).not.toHaveProperty('spanId');
    });

    it('flushes structured output with trace context when no trailing newline is present', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const traceContext = createTraceContext();
      traceContext.parentSpanId = 'parent-span-1234';

      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'structured-flush-trace',
        verifyMode: false,
        structured: true,
        traceContext,
      });

      await logger(Readable.from(['buffered-structured']));

      const parsed = await parseFirstStructuredLog('structured-flush-trace');

      expect(parsed).toMatchObject({
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        sampled: traceContext.samplingDecision,
      });
    });

    it('preserves trace context with parent span ID', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const traceContext = createTraceContext();
      traceContext.parentSpanId = 'parent123456789abcde';

      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'eslint',
        verifyMode: false,
        structured: true,
        traceContext,
      });

      await logger(Readable.from(['test output\n']));

      const parsed = await parseFirstStructuredLog('eslint');

      expect(parsed).toHaveProperty('parentSpanId', traceContext.parentSpanId);
    });

    it('includes trace ID with max bytes truncation', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const traceContext = createTraceContext();
      const logger = await createLogger({
        logDir: tempDir,
        linterId: 'eslint',
        verifyMode: false,
        traceContext,
        maxBytes: 150,
      });

      await logger(
        Readable.from([
          'short\n',
          'this is a much longer line that will exceed max bytes but not before we capture the trace id\n',
        ]),
      );

      const out = await readLog('eslint');
      const traceIdShort = traceContext.traceId.slice(0, 8);
      expect(out).toContain(`[trace=${traceIdShort}]`);
      expect(out).toContain('[TRUNCATED at 150 bytes]');
    });
  });
});
