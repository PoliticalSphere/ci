/**
 * Deferred promise helper used by tests.
 */

/**
 * Create a deferred promise with exposed resolve/reject handlers for tests.
 *
 * @template T - Promise value type.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  const deferred: {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  } = {
    promise,
    resolve,
    reject,
  };
  return deferred;
}

/**
 * Backwards-compatible alias for tests that referenced `_createDeferred`.
 */
export const _createDeferred = createDeferred;
