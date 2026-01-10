/**
 * Political Sphere — Event Emitter Tests
 *
 * Verifies:
 *   - Event listener registration and emission
 *   - Mock child process creation and behavior
 *   - Process lifecycle events (exit, error)
 *   - Stream data handling and verification
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createMockChild,
  MockEmitter,
  mockProcessError,
  mockProcessExit,
  mockStreamData,
} from './emitter.ts';

describe('MockEmitter', () => {
  it('invokes listeners added for the same event', () => {
    const emitter = new MockEmitter();
    const first = vi.fn();
    const second = vi.fn();

    emitter.on('data', first);
    emitter.on('data', second);

    emitter.emit('data', 'payload');

    expect(first).toHaveBeenCalledWith('payload');
    expect(second).toHaveBeenCalledWith('payload');
  });

  it('initializes listeners array on first registration', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();

    emitter.on('newEvent', listener);
    emitter.emit('newEvent', 'test');

    expect(listener).toHaveBeenCalledWith('test');
  });

  it('handles multiple events independently', () => {
    const emitter = new MockEmitter();
    const dataListener = vi.fn();
    const errorListener = vi.fn();

    emitter.on('data', dataListener);
    emitter.on('error', errorListener);

    emitter.emit('data', 'data-payload');
    emitter.emit('error', 'error-payload');

    expect(dataListener).toHaveBeenCalledWith('data-payload');
    expect(errorListener).toHaveBeenCalledWith('error-payload');
  });

  it('emits event with multiple arguments', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();

    emitter.on('multi', listener);
    emitter.emit('multi', 'arg1', 'arg2', 'arg3');

    expect(listener).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
  });

  it('returns this for method chaining', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();

    const result = emitter.on('test', listener);

    expect(result).toBe(emitter);
  });

  it('handles emit on unregistered events gracefully', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();

    emitter.on('other', listener);
    emitter.emit('unregistered', 'payload');

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports once method', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();
    emitter.once('event', listener);
    emitter.emit('event', 'arg1');
    emitter.emit('event', 'arg2');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('arg1');
  });

  it('supports off method', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();
    emitter.on('event', listener);
    emitter.off('event', listener);
    emitter.emit('event', 'arg');
    expect(listener).not.toHaveBeenCalled();
  });

  it('off preserves remaining listeners when one is removed', () => {
    const emitter = new MockEmitter();
    const first = vi.fn();
    const second = vi.fn();
    emitter.on('event', first);
    emitter.on('event', second);
    emitter.off('event', first);
    emitter.emit('event', 'arg');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('arg');
  });

  it('off method handles removing from non-existent event', () => {
    const emitter = new MockEmitter();
    const listener = vi.fn();
    const result = emitter.off('nonexistent', listener);
    expect(result).toBe(emitter);
  });

  it('supports removeAllListeners', () => {
    const emitter = new MockEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    emitter.on('event1', listener1);
    emitter.on('event2', listener2);
    emitter.removeAllListeners();
    emitter.emit('event1', 'arg');
    emitter.emit('event2', 'arg');
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('removeAllListeners can remove specific event', () => {
    const emitter = new MockEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    emitter.on('event1', listener1);
    emitter.on('event2', listener2);
    const result = emitter.removeAllListeners('event1');
    expect(result).toBe(emitter);
    emitter.emit('event1', 'arg');
    emitter.emit('event2', 'arg');
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith('arg');
  });

  it('removeAllListeners without event parameter clears all listeners', () => {
    const emitter = new MockEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();
    emitter.on('event1', listener1);
    emitter.on('event1', listener2);
    emitter.on('event2', listener3);
    const result = emitter.removeAllListeners();
    expect(result).toBe(emitter);
    emitter.emit('event1', 'arg');
    emitter.emit('event2', 'arg');
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
    expect(listener3).not.toHaveBeenCalled();
  });

  it('supports listenerCount', () => {
    const emitter = new MockEmitter();
    emitter.on('event', () => {});
    emitter.on('event', () => {});
    expect(emitter.listenerCount('event')).toBe(2);
  });

  it('listenerCount returns 0 for event with no listeners', () => {
    const emitter = new MockEmitter();
    expect(emitter.listenerCount('nonexistent')).toBe(0);
  });

  it('supports hasListeners', () => {
    const emitter = new MockEmitter();
    expect(emitter.hasListeners('event')).toBe(false);
    expect(emitter.hasListeners()).toBe(false);
    emitter.on('event', () => {});
    expect(emitter.hasListeners('event')).toBe(true);
    expect(emitter.hasListeners()).toBe(true);
  });

  it('hasListeners checks listener arrays in the map', () => {
    const emitter = new MockEmitter();
    emitter.on('event', () => {});
    expect(emitter.hasListeners()).toBe(true);
  });

  it('hasListeners returns true when any event has listeners', () => {
    const emitter = new MockEmitter();
    emitter.on('event1', () => {});
    emitter.on('event2', () => {});
    // triggers the for-of path where a listeners array length > 0 causes early true
    expect(emitter.hasListeners()).toBe(true);
  });

  it('hasListeners iterates over empty entries (branch coverage)', () => {
    const emitter = new MockEmitter();
    const hacked = emitter as unknown as {
      listeners: Map<string, Array<(...args: unknown[]) => void>>;
    };
    // Inject an empty listeners array to exercise the false branch inside the loop
    hacked.listeners.set('empty', []);
    expect(emitter.hasListeners()).toBe(false);
    // Add a real listener to exercise the true branch after encountering empty entries
    emitter.on('event', () => {});
    expect(emitter.hasListeners()).toBe(true);
  });
});

describe('createMockChild', () => {
  it('creates a mock child with emitter methods and properties', () => {
    const mockChild = createMockChild();

    expect(mockChild).toHaveProperty('on');
    expect(mockChild).toHaveProperty('emit');
    expect(mockChild).toHaveProperty('stdout');
    expect(mockChild).toHaveProperty('stderr');
    expect(typeof mockChild.pid).toBe('number');
    expect(mockChild.killedSignals).toEqual([]);
  });

  it('stdout and stderr are MockEmitter instances', () => {
    const mockChild = createMockChild();

    expect(mockChild.stdout).toBeInstanceOf(MockEmitter);
    expect(mockChild.stderr).toBeInstanceOf(MockEmitter);
  });

  it('allows registering listeners on child stdout', () => {
    const mockChild = createMockChild();
    const listener = vi.fn();

    mockChild.stdout.on('data', listener);
    mockChild.stdout.emit('data', 'output');

    expect(listener).toHaveBeenCalledWith('output');
  });

  it('allows registering listeners on child stderr', () => {
    const mockChild = createMockChild();
    const listener = vi.fn();

    mockChild.stderr.on('data', listener);
    mockChild.stderr.emit('data', 'error-output');

    expect(listener).toHaveBeenCalledWith('error-output');
  });

  it('records kill signals when kill is invoked', () => {
    const mockChild = createMockChild();

    const result = mockChild.kill('SIGKILL');

    expect(result).toBe(true);
    expect(mockChild.killedSignals).toEqual(['SIGKILL']);
  });
});

describe('Process mocking helpers', () => {
  it('mockProcessExit sets exit code', () => {
    const child = createMockChild();
    mockProcessExit(child, 42);
    expect((child as unknown as { exitCode?: number }).exitCode).toBe(42);
  });

  it('mockStreamData emits data on stdout', () => {
    const child = createMockChild();
    const listener = vi.fn();
    child.stdout.on('data', listener);
    mockStreamData(child, 'stdout', 'hello');
    expect(listener).toHaveBeenCalledWith('hello');
  });

  it('mockStreamData emits data on stderr', () => {
    const child = createMockChild();
    const listener = vi.fn();
    child.stderr.on('data', listener);
    mockStreamData(child, 'stderr', 'error output');
    expect(listener).toHaveBeenCalledWith('error output');
  });

  it('mockProcessError emits error on process', () => {
    const child = createMockChild();
    const listener = vi.fn();
    const error = new Error('test error');
    child.on('error', listener);
    mockProcessError(child, error);
    expect(listener).toHaveBeenCalledWith(error);
  });

  it('mockProcessExit and mockStreamData work together', () => {
    const child = createMockChild();
    const stdoutListener = vi.fn();
    const stderrListener = vi.fn();

    child.stdout.on('data', stdoutListener);
    child.stderr.on('data', stderrListener);

    mockStreamData(child, 'stdout', 'output');
    mockStreamData(child, 'stderr', 'error');
    mockProcessExit(child, 1);

    expect(stdoutListener).toHaveBeenCalledWith('output');
    expect(stderrListener).toHaveBeenCalledWith('error');
    expect((child as unknown as { exitCode?: number }).exitCode).toBe(1);
  });
});
