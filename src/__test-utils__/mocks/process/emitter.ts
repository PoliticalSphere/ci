/**
 * Political Sphere — Event Emitter Test Utilities
 *
 * Role:
 *   Lightweight EventEmitter mock for deterministic testing.
 *
 * Responsibilities:
 *   - Register and track event listeners
 *   - Emit events with arguments
 *   - Verify listener invocations
 *
 * This file is:
 *   - Test-only infrastructure
 *   - Simplified Node.js EventEmitter interface
 *   - Deterministic and inspectable
 *
 */

/**
 * Lightweight mock implementation of Node.js EventEmitter
 * Supports event registration, emission, and listener tracking
 */
export class MockEmitter {
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  /**
   * Register a listener for an event
   * @param {string} event - Event name
   * @param {(...args: unknown[]) => void} cb - Callback function to invoke when event is emitted
   * @returns {this} this for method chaining
   */
  on(event: string, cb: (...args: unknown[]) => void): this {
    const existing = this.listeners.get(event);
    if (existing) {
      existing.push(cb);
    } else {
      this.listeners.set(event, [cb]);
    }
    return this;
  }

  /**
   * Register a one-time listener for an event
   * @param {string} event - Event name
   * @param {(...args: unknown[]) => void} cb - Callback function to invoke once
   * @returns {this} this for method chaining
   */
  once(event: string, cb: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      cb(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove a specific listener
   * @param {string} event - Event name
   * @param {(...args: unknown[]) => void} cb - Callback to remove
   * @returns {this} this for method chaining
   */
  off(event: string, cb: (...args: unknown[]) => void): this {
    const existing = this.listeners.get(event);
    if (!existing) {
      return this;
    }
    const next = existing.filter((listener) => listener !== cb);
    if (next.length > 0) {
      this.listeners.set(event, next);
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * Emit an event to all registered listeners
   * @param {string} event - Event name
   * @param {unknown[]} args - Arguments to pass to listeners
   * @returns {void}
   */
  emit(event: string, ...args: unknown[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        cb(...args);
      }
    }
  }

  /**
   * Remove all listeners for an event or all events
   * @param {string} [event] - Optional event name; if omitted, removes all listeners
   * @returns {this} this for method chaining
   */
  removeAllListeners(event?: string): this {
    if (typeof event === 'string') {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * Get count of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Check if emitter has listeners
   * @param {string} [event] - Optional event name
   * @returns {boolean} true if emitter has listeners
   */
  hasListeners(event?: string): boolean {
    if (typeof event === 'string') {
      return this.listenerCount(event) > 0;
    }
    for (const listeners of this.listeners.values()) {
      if (listeners.length > 0) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Type definition for mock child process
 * Mimics core properties and methods of child_process.ChildProcess
 */
export type MockChild = MockEmitter & {
  readonly stdout: MockEmitter;
  readonly stderr: MockEmitter;
  readonly pid: number;
  readonly killedSignals: Array<NodeJS.Signals | number | undefined>;
  readonly exitCode: number | null;
  readonly killed: boolean;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

let nextPid = 1000;

/**
 * Create a mock child process for testing
 * Provides stdout/stderr streams and process control methods
 * @returns {MockChild} Mock child process instance
 *
 * @example
 * ```ts
 * const mockChild = createMockChild();
 * mockChild.stdout.on('data', (data) => console.log(data));
 * mockChild.stdout.emit('data', 'hello');
 * mockChild.kill('SIGTERM');
 * ```
 */
export function createMockChild(): MockChild {
  const pid = nextPid++;
  const killedSignals: Array<NodeJS.Signals | number | undefined> = [];
  let killed = false;
  const exitCode: number | null = null;

  return Object.assign(new MockEmitter(), {
    stdout: new MockEmitter(),
    stderr: new MockEmitter(),
    pid,
    killedSignals,
    exitCode: exitCode,
    killed: killed,
    kill: (signal?: NodeJS.Signals | number) => {
      killedSignals.push(signal);
      killed = true;
      return true;
    },
  }) as MockChild;
}

/**
 * Helper to simulate process completion
 * @param {MockChild} mockChild - Mock child process
 * @param {number} [code] - Exit code
 * @returns {void}
 */
export function mockProcessExit(mockChild: MockChild, code: number = 0): void {
  const child = mockChild as unknown as { exitCode?: number | null };
  child.exitCode = code;
}

/**
 * Helper to simulate process output
 * @param {MockChild} mockChild - Mock child process
 * @param {'stdout'|'stderr'} stream - 'stdout' or 'stderr'
 * @param {string} data - Data to emit
 * @returns {void}
 */
export function mockStreamData(
  mockChild: MockChild,
  stream: 'stdout' | 'stderr',
  data: string,
): void {
  if (stream === 'stdout') {
    mockChild.stdout.emit('data', data);
  } else {
    mockChild.stderr.emit('data', data);
  }
}

/**
 * Helper to simulate process error
 * @param {MockChild} mockChild - Mock child process
 * @param {Error} error - Error to emit
 * @returns {void}
 */
export function mockProcessError(mockChild: MockChild, error: Error): void {
  mockChild.emit('error', error);
}
