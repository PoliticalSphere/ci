/**
 * Political Sphere — Stream Mock Utilities
 *
 * Role:
 *   Mock Node.js streams for deterministic I/O testing.
 *
 * Responsibilities:
 *   - Mock WriteStream and ReadStream interfaces
 *   - Capture written data for verification
 *   - Emit stream events for testing
 *
 * This file is:
 *   - Test-only infrastructure
 *   - Simplified stream interface
 *   - Deterministic and inspectable
 */

/**
 * Mock implementation of Node.js WriteStream
 * Captures written data for assertions
 */
export interface StreamMock extends NodeJS.WriteStream {
  isTTY: boolean;
  data: string[];
  errors: Error[];
  closed: boolean;
}

/**
 * Create a mock write stream for testing
 * @returns {StreamMock} Mock stream that captures written data
 */
export function createStreamMock(): StreamMock {
  const data: string[] = [];
  const errors: Error[] = [];
  let closed = false;

  const stream: StreamMock = {
    isTTY: false,
    data,
    errors,
    closed,
    write: (chunk: string | Buffer): boolean => {
      if (closed) {
        throw new Error('write() called on closed stream');
      }
      data.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    },
    end: (): StreamMock => {
      closed = true;
      return stream;
    },
    destroy: (): StreamMock => {
      closed = true;
      return stream;
    },
    once: (): StreamMock => stream,
    on: (): StreamMock => stream,
    emit: (): boolean => false,
    off: (): StreamMock => stream,
    removeListener: (): StreamMock => stream,
    removeAllListeners: (): StreamMock => stream,
    listeners: (): Array<() => void> => [],
    listenerCount: (): number => 0,
    eventNames: (): string[] => [],
    getMaxListeners: (): number => 10,
    setMaxListeners: (): StreamMock => stream,
    prependListener: (): StreamMock => stream,
    prependOnceListener: (): StreamMock => stream,
    addListener: (): StreamMock => stream,
  } as unknown as StreamMock;

  return stream;
}

/**
 * Create a pair of stdout/stderr mocks
 * @returns {object} Object with stdout and stderr mocks
 */
export function createStreamMockPair(): {
  readonly stdout: StreamMock;
  readonly stderr: StreamMock;
} {
  return {
    stdout: createStreamMock(),
    stderr: createStreamMock(),
  };
}
