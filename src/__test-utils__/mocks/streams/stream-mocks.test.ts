/**
 * Political Sphere — Stream Mocks Tests
 *
 * Verifies:
 *   - Mock stream creation and behavior
 *   - Write and read stream interfaces
 *   - Data capture and verification
 *   - Stream pair coordination
 */

import { describe, expect, it } from 'vitest';
import { createStreamMock, createStreamMockPair } from './stream-mocks.ts';

describe('Stream mocks', () => {
  it('createStreamMock creates a writable stream', () => {
    const stream = createStreamMock();
    expect(stream.isTTY).toBe(false);
    expect(stream.data).toEqual([]);
    expect(stream.write('test')).toBe(true);
    expect(stream.data).toEqual(['test']);
  });

  it('createStreamMockPair creates stdout and stderr', () => {
    const { stdout, stderr } = createStreamMockPair();
    expect(stdout).toBeDefined();
    expect(stderr).toBeDefined();
    stdout.write('out');
    stderr.write('err');
    expect(stdout.data).toEqual(['out']);
    expect(stderr.data).toEqual(['err']);
  });

  it('stream mock throws on write after close', () => {
    const stream = createStreamMock();
    stream.end();
    expect(() => stream.write('test')).toThrow();
  });

  it('handles multiple writes', () => {
    const stream = createStreamMock();
    stream.write('first');
    stream.write('second');
    stream.write('third');
    expect(stream.data).toEqual(['first', 'second', 'third']);
  });

  it('handles Buffer writes', () => {
    const stream = createStreamMock();
    const buffer = Buffer.from('test buffer');
    stream.write(buffer);
    expect(stream.data).toEqual(['test buffer']);
  });

  it('end method closes the stream', () => {
    const stream = createStreamMock();
    stream.write('before close');
    stream.end();
    expect(() => stream.write('after close')).toThrow('write() called on closed stream');
  });

  it('destroy method closes the stream', () => {
    const stream = createStreamMock();
    stream.write('before destroy');
    stream.destroy();
    expect(() => stream.write('after destroy')).toThrow('write() called on closed stream');
  });

  it('supports once method', () => {
    const stream = createStreamMock();
    const result = stream.once('event', () => {});
    expect(result).toBe(stream);
  });

  it('supports on method', () => {
    const stream = createStreamMock();
    const result = stream.on('event', () => {});
    expect(result).toBe(stream);
  });

  it('supports emit method', () => {
    const stream = createStreamMock();
    const result = stream.emit('event', 'data');
    expect(result).toBe(false);
  });

  it('supports off method', () => {
    const stream = createStreamMock();
    const result = stream.off('event', () => {});
    expect(result).toBe(stream);
  });

  it('supports removeListener method', () => {
    const stream = createStreamMock();
    const result = stream.removeListener('event', () => {});
    expect(result).toBe(stream);
  });

  it('supports removeAllListeners method', () => {
    const stream = createStreamMock();
    const result = stream.removeAllListeners('event');
    expect(result).toBe(stream);
  });

  it('supports listeners method', () => {
    const stream = createStreamMock();
    const result = stream.listeners('event');
    expect(result).toEqual([]);
  });

  it('supports listenerCount method', () => {
    const stream = createStreamMock();
    const result = stream.listenerCount('event');
    expect(result).toBe(0);
  });

  it('supports eventNames method', () => {
    const stream = createStreamMock();
    const result = stream.eventNames();
    expect(result).toEqual([]);
  });

  it('supports getMaxListeners method', () => {
    const stream = createStreamMock();
    const result = stream.getMaxListeners();
    expect(result).toBe(10);
  });

  it('supports setMaxListeners method', () => {
    const stream = createStreamMock();
    const result = stream.setMaxListeners(20);
    expect(result).toBe(stream);
  });

  it('supports prependListener method', () => {
    const stream = createStreamMock();
    const result = stream.prependListener('event', () => {});
    expect(result).toBe(stream);
  });

  it('supports prependOnceListener method', () => {
    const stream = createStreamMock();
    const result = stream.prependOnceListener('event', () => {});
    expect(result).toBe(stream);
  });

  it('supports addListener method', () => {
    const stream = createStreamMock();
    const result = stream.addListener('event', () => {});
    expect(result).toBe(stream);
  });
});
